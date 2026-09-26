// GAMMS AEP Staff Session Management Library
import { sha256Hex } from "./crypto.js";
import { getUserPermissions, getUserRoles } from "./rbac.js";
import { logAuditEvent } from "./audit.js";

export const STAFF_COOKIE_NAME = "GAMMS-AEP-Staff";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildStaffCookie(token, maxAge = SESSION_TTL_SECONDS, isSecure = true) {
  const parts = [
    `${STAFF_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/aep"
  ];
  if (maxAge > 0) {
    parts.push(`Max-Age=${maxAge}`);
  } else {
    parts.push("Max-Age=0");
    parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  }
  if (isSecure) parts.push("Secure");
  return parts.join("; ");
}

export function clearStaffCookie(isSecure = true) {
  return buildStaffCookie("", 0, isSecure);
}

/**
 * Creates a new staff session for a real DB user (aep_users.id > 0).
 */
export async function createStaffSession(db, userId, userAgent = null, ipAddress = null) {
  const numericUserId = Number.parseInt(userId, 10);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    throw new TypeError("createStaffSession requires a positive integer DB userId from aep_users.");
  }

  const token = generateSessionToken();
  const tokenHash = await sha256Hex(token);
  const sessionId = `staff-sess-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await db.prepare(`
    INSERT INTO aep_staff_sessions (id, user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sessionId, numericUserId, tokenHash, expiresAt, userAgent, ipAddress).run();

  await db.prepare("UPDATE aep_users SET last_login_at = CURRENT_TIMESTAMP, failed_login_count = 0, locked_until = NULL WHERE id = ?")
    .bind(numericUserId).run();

  return { token, sessionId, expiresAt };
}

/**
 * Validates a staff session token from request.
 */
export async function verifyStaffSessionToken(db, token) {
  if (!token || typeof token !== "string") return null;

  const tokenHash = await sha256Hex(token);
  const session = await db.prepare(`
    SELECT 
      s.id as sessionId, s.user_id as userId, s.session_version as sessionVersion,
      s.expires_at as expiresAt, u.username, u.display_name as displayName,
      u.active, u.must_change_password as mustChangePassword
    FROM aep_staff_sessions s
    JOIN aep_users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first();

  if (!session || session.active !== 1) return null;

  const roles = await getUserRoles(db, session.userId);
  const permissions = await getUserPermissions(db, session.userId);

  // Update last activity
  await db.prepare("UPDATE aep_staff_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session.sessionId).run();

  return {
    isStaffSession: true,
    isEnvOwner: false,
    sessionId: session.sessionId,
    userId: session.userId,
    username: session.username,
    displayName: session.displayName,
    mustChangePassword: Boolean(session.mustChangePassword),
    roles,
    permissions
  };
}

/**
 * Revokes a specific session.
 */
export async function revokeSession(db, actor, sessionId) {
  await db.prepare("DELETE FROM aep_staff_sessions WHERE id = ?").bind(sessionId).run();
  await logAuditEvent(db, {
    actorType: actor.type || "staff",
    actorIdentifier: actor.identifier || "system",
    action: "staff.session.revoked",
    entityType: "staff_session",
    entityIdentifier: sessionId
  });
  return { valid: true };
}

/**
 * Revokes all sessions for a specific user.
 */
export async function revokeAllUserSessions(db, actor, userId) {
  const numericUserId = Number.parseInt(userId, 10);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return { valid: false, error: "ID de usuario inválido" };
  }
  await db.prepare("DELETE FROM aep_staff_sessions WHERE user_id = ?").bind(numericUserId).run();
  await logAuditEvent(db, {
    actorType: actor.type || "staff",
    actorIdentifier: actor.identifier || "system",
    action: "staff.user.sessions_revoked_all",
    entityType: "staff_user",
    entityIdentifier: String(numericUserId)
  });
  return { valid: true };
}

/**
 * List all active sessions across all users (for admin view).
 */
export async function listActiveSessions(db) {
  const rows = await db.prepare(`
    SELECT 
      s.id as sessionId, s.user_id as userId, u.username, u.display_name as displayName,
      s.created_at as createdAt, s.last_activity_at as lastActivityAt, s.expires_at as expiresAt,
      s.user_agent as userAgent, s.ip_address as ipAddress
    FROM aep_staff_sessions s
    JOIN aep_users u ON s.user_id = u.id
    WHERE s.expires_at > CURRENT_TIMESTAMP
    ORDER BY s.last_activity_at DESC
  `).all();

  const sessions = rows?.results || [];
  for (const s of sessions) {
    s.roles = await getUserRoles(db, s.userId);
  }
  return sessions;
}
