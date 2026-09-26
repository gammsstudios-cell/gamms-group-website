// GAMMS AEP Staff User Management Library
import { hashPasswordPbkdf2 } from "./passwords.js";
import { getUserPermissions, getUserRoles, validateNoPrivilegeEscalation } from "./rbac.js";
import { logAuditEvent } from "./audit.js";

/**
 * Validates a username.
 * Rules: 3-50 characters, letters, numbers, dot, underscore, dash. No spaces.
 */
export function validateUsername(username) {
  if (typeof username !== "string") {
    return { valid: false, error: "El usuario debe ser una cadena de texto" };
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 50) {
    return { valid: false, error: "El usuario debe tener entre 3 y 50 caracteres" };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return { valid: false, error: "El usuario solo puede contener letras, números, puntos, guiones y guiones bajos" };
  }
  return { valid: true, username: trimmed, normalized: trimmed.toLowerCase() };
}

/**
 * Validates password strength (minimum 8 chars).
 */
export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    return { valid: false, error: "La contraseña debe tener al menos 8 caracteres" };
  }
  return { valid: true };
}

/**
 * Creates a new internal staff user.
 */
export async function createStaffUser(db, actor, userData) {
  const userVal = validateUsername(userData.username || "");
  if (!userVal.valid) return userVal;

  const passVal = validatePassword(userData.password || "");
  if (!passVal.valid) return passVal;

  if (!userData.displayName || typeof userData.displayName !== "string" || userData.displayName.trim().length < 2) {
    return { valid: false, error: "El nombre visible debe tener al menos 2 caracteres" };
  }

  // Check unique username
  const existing = await db.prepare("SELECT id FROM aep_users WHERE username_normalized = ?")
    .bind(userVal.normalized).first();
  if (existing) {
    return { valid: false, error: "El nombre de usuario ya existe" };
  }

  // Validate roles and prevent privilege escalation
  const requestedRoleIds = Array.isArray(userData.roleIds) ? userData.roleIds : [5]; // Default Vendedor
  if (requestedRoleIds.includes(1) && !actor.isEnvOwner) {
    return { valid: false, error: "No se puede asignar el rol Owner desde la interfaz" };
  }

  const { hash, salt, iterations } = await hashPasswordPbkdf2(userData.password);

  const stmt = await db.prepare(`
    INSERT INTO aep_users (
      username, username_normalized, display_name, password_algo, password_hash, password_salt, password_iterations, must_change_password, active
    ) VALUES (?, ?, ?, 'pbkdf2-sha256', ?, ?, ?, ?, 1)
    RETURNING id
  `).bind(userVal.username, userVal.normalized, userData.displayName.trim(), hash, salt, iterations, userData.mustChangePassword ? 1 : 0).first();

  const userId = stmt.id;

  // Insert roles
  for (const roleId of requestedRoleIds) {
    await db.prepare("INSERT OR IGNORE INTO aep_user_roles (user_id, role_id) VALUES (?, ?)")
      .bind(userId, roleId).run();
  }

  await logAuditEvent(db, {
    actorType: actor.type || "admin",
    actorIdentifier: actor.identifier || "admin",
    action: "staff.user.created",
    entityType: "staff_user",
    entityIdentifier: String(userId),
    metadata: { username: userVal.username, displayName: userData.displayName.trim(), roleIds: requestedRoleIds }
  });

  return { valid: true, userId, username: userVal.username };
}

/**
 * List all staff users with their assigned roles.
 */
export async function listStaffUsers(db) {
  const users = await db.prepare(`
    SELECT 
      u.id, u.username, u.display_name as displayName, u.must_change_password as mustChangePassword,
      u.active, u.failed_login_count as failedLoginCount, u.locked_until as lockedUntil,
      u.last_login_at as lastLoginAt, u.totp_enabled as totpEnabled, u.created_at as createdAt
    FROM aep_users u
    ORDER BY u.id ASC
  `).all();

  const userList = users?.results || [];

  for (const u of userList) {
    u.roles = await getUserRoles(db, u.id);
  }

  return userList;
}

/**
 * Gets details for a specific user.
 */
export async function getStaffUserById(db, userId) {
  const u = await db.prepare(`
    SELECT 
      id, username, display_name as displayName, must_change_password as mustChangePassword,
      active, failed_login_count as failedLoginCount, locked_until as lockedUntil,
      last_login_at as lastLoginAt, totp_enabled as totpEnabled, created_at as createdAt
    FROM aep_users
    WHERE id = ?
  `).bind(userId).first();

  if (!u) return null;
  u.roles = await getUserRoles(db, u.id);
  u.permissions = await getUserPermissions(db, u.id);
  return u;
}

/**
 * Updates a staff user profile and roles.
 */
export async function updateStaffUser(db, actor, userId, updates) {
  const target = await getStaffUserById(db, userId);
  if (!target) return { valid: false, error: "Usuario no encontrado" };

  if (updates.displayName !== undefined) {
    if (typeof updates.displayName !== "string" || updates.displayName.trim().length < 2) {
      return { valid: false, error: "Nombre visible inválido" };
    }
    await db.prepare("UPDATE aep_users SET display_name = ? WHERE id = ?")
      .bind(updates.displayName.trim(), userId).run();
  }

  if (updates.active !== undefined) {
    const newActive = updates.active ? 1 : 0;
    await db.prepare("UPDATE aep_users SET active = ? WHERE id = ?")
      .bind(newActive, userId).run();

    if (newActive === 0) {
      // Invalidate all active sessions for disabled user
      await db.prepare("DELETE FROM aep_staff_sessions WHERE user_id = ?").bind(userId).run();
    }
  }

  if (Array.isArray(updates.roleIds)) {
    if (updates.roleIds.includes(1) && !actor.isEnvOwner) {
      return { valid: false, error: "No se puede otorgar el rol Owner" };
    }

    await db.prepare("DELETE FROM aep_user_roles WHERE user_id = ?").bind(userId).run();
    for (const rId of updates.roleIds) {
      await db.prepare("INSERT OR IGNORE INTO aep_user_roles (user_id, role_id) VALUES (?, ?)").bind(userId, rId).run();
    }

    // Invalidate sessions on role change
    await db.prepare("UPDATE aep_staff_sessions SET session_version = session_version + 1 WHERE user_id = ?").bind(userId).run();
  }

  await logAuditEvent(db, {
    actorType: actor.type || "admin",
    actorIdentifier: actor.identifier || "admin",
    action: "staff.user.updated",
    entityType: "staff_user",
    entityIdentifier: String(userId),
    metadata: updates
  });

  return { valid: true };
}

/**
 * Resets a staff user's password (by admin).
 */
export async function resetStaffUserPassword(db, actor, userId, newPassword) {
  const passVal = validatePassword(newPassword);
  if (!passVal.valid) return passVal;

  const { hash, salt, iterations } = await hashPasswordPbkdf2(newPassword);

  await db.prepare(`
    UPDATE aep_users
    SET password_algo = 'pbkdf2-sha256', password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 1, failed_login_count = 0, locked_until = NULL
    WHERE id = ?
  `).bind(hash, salt, iterations, userId).run();

  // Invalidate old sessions
  await db.prepare("DELETE FROM aep_staff_sessions WHERE user_id = ?").bind(userId).run();

  await logAuditEvent(db, {
    actorType: actor.type || "admin",
    actorIdentifier: actor.identifier || "admin",
    action: "staff.user.password_reset",
    entityType: "staff_user",
    entityIdentifier: String(userId)
  });

  return { valid: true };
}

/**
 * Records a failed login attempt and locks account if threshold (5) reached.
 */
export async function recordFailedLogin(db, userId, username) {
  if (!userId) return;

  const user = await db.prepare("SELECT failed_login_count FROM aep_users WHERE id = ?").bind(userId).first();
  const newCount = (user?.failed_login_count || 0) + 1;

  if (newCount >= 5) {
    // Lock for 15 minutes
    const lockTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await db.prepare("UPDATE aep_users SET failed_login_count = ?, locked_until = ? WHERE id = ?")
      .bind(newCount, lockTime, userId).run();

    await logAuditEvent(db, {
      actorType: "system",
      actorIdentifier: "lockout_guard",
      action: "staff.locked",
      entityType: "staff_user",
      entityIdentifier: String(userId),
      metadata: { username, lockedUntil: lockTime }
    });
  } else {
    await db.prepare("UPDATE aep_users SET failed_login_count = ? WHERE id = ?").bind(newCount, userId).run();

    await logAuditEvent(db, {
      actorType: "system",
      actorIdentifier: "auth_guard",
      action: "staff.login.failed",
      entityType: "staff_user",
      entityIdentifier: String(userId),
      metadata: { username, failedCount: newCount }
    });
  }
}
