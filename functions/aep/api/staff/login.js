// POST /aep/api/staff/login
import { loginAdmin, createAdminSession, buildAdminCookie, clearAdminCookie } from "../../_lib/adminAuth.js";
import { clearSellerCookie } from "../../_lib/sellerAuth.js";
import { verifyPassword, hashPasswordPbkdf2, needsPasswordRehash, MAX_PASSWORD_LENGTH } from "../../_lib/passwords.js";
import { createStaffSession, buildStaffCookie, clearStaffCookie } from "../../_lib/staffSessions.js";
import { recordFailedLogin } from "../../_lib/staffUsers.js";
import { getUserPermissions, getUserRoles, ALL_SYSTEM_PERMISSIONS } from "../../_lib/rbac.js";
import { verifyTotpCodeWithReplay, consumeRecoveryCodeAtomic, decryptTotpSecret } from "../../_lib/totp.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";
import { logAuditEvent } from "../../_lib/audit.js";

const OWNER_MFA_PRINCIPAL_REF = "env:admin:mfa";
const OWNER_MFA_LOCK_THRESHOLD = 5;
const OWNER_MFA_LOCK_MS = 15 * 60 * 1000;

async function getOwnerMfaLockoutState(db) {
  if (!db) return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
  try {
    const row = await db.prepare(`
      SELECT failed_count, locked_until
      FROM auth_principal_lockout_state
      WHERE principal_ref = ?
    `)
      .bind(OWNER_MFA_PRINCIPAL_REF)
      .first();
    if (!row) return { ok: true, failedCount: 0, lockedUntil: null };
    const failedCount = Number(row.failed_count);
    const lockedUntil = row.locked_until ?? null;
    if (!Number.isSafeInteger(failedCount) || failedCount < 0) {
      return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
    }
    if (lockedUntil !== null && (typeof lockedUntil !== "string" || Number.isNaN(Date.parse(lockedUntil)))) {
      return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
    }
    return { ok: true, failedCount, lockedUntil };
  } catch {
    return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
  }
}

function isOwnerMfaLocked(state, nowMs = Date.now()) {
  if (!state?.lockedUntil) return false;
  const lockedUntilMs = Date.parse(state.lockedUntil);
  return Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs;
}

async function recordOwnerMfaFailure(db) {
  if (!db) return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const lockedUntilIso = new Date(now + OWNER_MFA_LOCK_MS).toISOString();
  try {
    const row = await db.prepare(`
      INSERT INTO auth_principal_lockout_state (
        principal_ref, failed_count, locked_until, updated_at
      )
      VALUES (?, 1, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(principal_ref) DO UPDATE SET
        failed_count = CASE
          WHEN locked_until IS NOT NULL AND locked_until > ? THEN failed_count
          WHEN locked_until IS NOT NULL AND locked_until <= ? THEN 1
          ELSE failed_count + 1
        END,
        locked_until = CASE
          WHEN locked_until IS NOT NULL AND locked_until > ? THEN locked_until
          WHEN locked_until IS NOT NULL AND locked_until <= ? THEN NULL
          WHEN failed_count + 1 >= ? THEN ?
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING failed_count, locked_until
    `).bind(
      OWNER_MFA_PRINCIPAL_REF,
      nowIso,
      nowIso,
      nowIso,
      nowIso,
      OWNER_MFA_LOCK_THRESHOLD,
      lockedUntilIso
    ).first();
    if (!row) return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
    return { ok: true, failedCount: Number(row.failed_count), lockedUntil: row.locked_until ?? null };
  } catch {
    return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
  }
}

async function clearOwnerMfaFailures(db) {
  if (!db) return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
  try {
    const result = await db.prepare(`
      INSERT INTO auth_principal_lockout_state (
        principal_ref, failed_count, locked_until, updated_at
      )
      VALUES (?, 0, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(principal_ref) DO UPDATE SET
        failed_count = 0,
        locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).bind(OWNER_MFA_PRINCIPAL_REF).run();
    return { ok: true, result };
  } catch {
    return { ok: false, code: "OWNER_MFA_STATE_UNAVAILABLE" };
  }
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  if (typeof body?.username !== "string" || typeof body?.password !== "string") {
    return errorJson("Usuario y contraseña requeridos", 400, "CREDENTIALS_REQUIRED");
  }

  const username = body.username.trim();
  const password = body.password;
  const totpCode = typeof body.totpCode === "string" ? body.totpCode.trim() : (typeof body.mfaCode === "string" ? body.mfaCode.trim() : "");

  if (!username || !password) {
    return errorJson("Usuario y contraseña requeridos", 400, "CREDENTIALS_REQUIRED");
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return errorJson(`La contraseña excede la longitud máxima de ${MAX_PASSWORD_LENGTH} caracteres`, 400, "PASSWORD_TOO_LONG");
  }

  const isSecure = new URL(request.url).protocol === "https:";

  // 1. Check if login matches Owner ENV Account
  const envAdminUser = env.AEP_ADMIN_USERNAME || "admin";
  const isOwnerUsername = username.toLowerCase() === envAdminUser.toLowerCase();

  if (isOwnerUsername) {
    const adminAuthResult = await loginAdmin(env, password);
    if (adminAuthResult.code === "ADMIN_AUTH_NOT_CONFIGURED") {
      return errorJson(adminAuthResult.code, adminAuthResult.status);
    }
    if (adminAuthResult.ok) {
      // If Owner MFA secret exists, TOTP is required for Owner login
      if (env.AEP_ADMIN_TOTP_SECRET) {
        const ownerMfaState = await getOwnerMfaLockoutState(db);
        if (!ownerMfaState.ok) {
          return errorJson(ownerMfaState.code, 503);
        }
        if (isOwnerMfaLocked(ownerMfaState)) {
          return errorJson("STAFF_USER_LOCKED", 429);
        }

        if (!totpCode) {
          return errorJson("Código de autenticación requerido (MFA)", 401, "MFA_REQUIRED");
        }
        const totpRes = await verifyTotpCodeWithReplay(db, "env:admin", env.AEP_ADMIN_TOTP_SECRET, totpCode);
        if (!totpRes.valid && totpRes.code === "MFA_REPLAY_STATE_UNAVAILABLE") {
          return errorJson("MFA_REPLAY_STATE_UNAVAILABLE", 503);
        }
        if (!totpRes.valid) {
          const failureState = await recordOwnerMfaFailure(db);
          if (!failureState.ok) {
            return errorJson(failureState.code, 503);
          }
          if (totpRes.code === "MFA_REPLAYED") {
            return errorJson("Código MFA ya ha sido utilizado", 401, "MFA_REPLAYED");
          }
          if (totpRes.code === "MFA_REPLAY_STATE_UNAVAILABLE") {
            return errorJson("MFA_REPLAY_STATE_UNAVAILABLE", 503);
          }
          return errorJson("Código de autenticación inválido", 401, "MFA_INVALID");
        }
        const resetState = await clearOwnerMfaFailures(db);
        if (!resetState.ok) {
          return errorJson(resetState.code, 503);
        }
      }

      // Owner authenticated: Create Admin Session & Cookie
      const sessionToken = await createAdminSession(env, envAdminUser);
      const cookieHeader = buildAdminCookie(sessionToken, request);

      const headers = new Headers();
      headers.append("Set-Cookie", cookieHeader);
      headers.append("Set-Cookie", clearStaffCookie(isSecure));
      headers.append("Set-Cookie", clearSellerCookie(request));

      await logAuditEvent(db, {
        actorType: "admin",
        actorIdentifier: envAdminUser,
        action: "staff.login.success",
        entityType: "admin_session",
        entityIdentifier: "env:admin"
      });

      return jsonResponse({
        ok: true,
        user: {
          id: null,
          username: envAdminUser,
          displayName: "Owner",
          isEnvOwner: true,
          mustChangePassword: false,
          roles: [{ id: 1, name: "Owner", is_builtin: 1 }],
          permissions: ALL_SYSTEM_PERMISSIONS,
          actorRef: "env:admin"
        }
      }, { status: 200, headers });
    }

    return errorJson("STAFF_AUTH_INVALID", 401);
  }

  // 2. Check DB users (aep_users)
  const user = await db.prepare(`
    SELECT 
      id, username, username_normalized, display_name, password_algo, password_hash,
      password_salt, password_iterations, must_change_password, active,
      failed_login_count, locked_until, totp_enabled, totp_secret_enc, recovery_codes_json
    FROM aep_users
    WHERE username_normalized = LOWER(?)
    LIMIT 1
  `).bind(username).first();

  if (!user) {
    return errorJson("Usuario o contraseña incorrectos", 401, "STAFF_AUTH_INVALID");
  }

  if (user.active !== 1) {
    return errorJson("Cuenta desactivada. Contacta al administrador.", 403, "STAFF_USER_DISABLED");
  }

  // Check lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return errorJson("Cuenta bloqueada temporalmente debido a múltiples intentos fallidos. Intenta más tarde.", 429, "STAFF_USER_LOCKED");
  }

  // Verify password
  const validPass = await verifyPassword(
    password,
    user.password_hash,
    user.password_algo,
    user.password_salt,
    user.password_iterations
  );

  if (!validPass) {
    await recordFailedLogin(db, user.id, username);
    return errorJson("Usuario o contraseña incorrectos", 401, "STAFF_AUTH_INVALID");
  }

  // 3. Check MFA TOTP if enabled
  if (user.totp_enabled === 1) {
    if (!totpCode) {
      return errorJson("Código de autenticación requerido (MFA)", 401, "MFA_REQUIRED");
    }

    let totpValid = false;
    let failureReason = "MFA_INVALID";

    if (user.totp_secret_enc) {
      const secret = await decryptTotpSecret(user.totp_secret_enc, env.AEP_MFA_ENCRYPTION_KEY);
      if (secret) {
        const totpResult = await verifyTotpCodeWithReplay(db, `staff:${user.id}`, secret, totpCode);
        if (totpResult.valid) {
          totpValid = true;
        } else if (totpResult.code === "MFA_REPLAYED") {
          failureReason = "MFA_REPLAYED";
        } else if (totpResult.code === "MFA_REPLAY_STATE_UNAVAILABLE") {
          return errorJson("MFA_REPLAY_STATE_UNAVAILABLE", 503);
        }
      }
    }

    if (!totpValid) {
      // Try atomic recovery code
      const recResult = await consumeRecoveryCodeAtomic(db, user.id, totpCode);
      if (recResult.valid) {
        totpValid = true;
        await logAuditEvent(db, {
          actorType: "staff",
          actorIdentifier: user.username,
          action: "mfa.recovery.used",
          entityType: "staff_user",
          entityIdentifier: String(user.id)
        });
      }
    }

    if (!totpValid) {
      await recordFailedLogin(db, user.id, username);
      if (failureReason === "MFA_REPLAYED") {
        return errorJson("Código MFA ya ha sido utilizado", 401, "MFA_REPLAYED");
      }
      return errorJson("Código de autenticación inválido", 401, "MFA_INVALID");
    }
  }

  // 4. Password Rehash (ONLY after both password AND MFA are verified!)
  if (needsPasswordRehash(user.password_hash, user.password_algo, user.password_iterations)) {
    try {
      const { hash, salt, iterations } = await hashPasswordPbkdf2(password);
      await db.prepare("UPDATE aep_users SET password_algo = 'pbkdf2-sha256', password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(hash, salt, iterations, user.id).run();
      await logAuditEvent(db, {
        actorType: "staff",
        actorIdentifier: user.username,
        action: "password.rehashed",
        entityType: "staff_user",
        entityIdentifier: String(user.id)
      });
    } catch {}
  }

  // Reset failed login count and clear lockout & update last_login_at
  await db.prepare("UPDATE aep_users SET failed_login_count = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(user.id).run();

  // Session creation
  const session = await createStaffSession(db, user.id, request.headers.get("User-Agent"));
  const cookieHeader = buildStaffCookie(session.token, 28800, isSecure);

  const roles = await getUserRoles(db, user.id);
  const permissions = await getUserPermissions(db, user.id);

  const headers = new Headers();
  headers.append("Set-Cookie", cookieHeader);
  headers.append("Set-Cookie", clearAdminCookie(request));
  headers.append("Set-Cookie", clearSellerCookie(request));

  await logAuditEvent(db, {
    actorType: "staff",
    actorIdentifier: user.username,
    action: "staff.login.success",
    entityType: "staff_session",
    entityIdentifier: session.sessionId
  });

  return jsonResponse({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      mustChangePassword: Boolean(user.must_change_password),
      roles,
      permissions
    }
  }, { status: 200, headers });
}
