// POST /aep/api/staff/login
import { sha256Hex } from "../../_lib/crypto.js";
import { verifyPassword, hashPasswordPbkdf2 } from "../../_lib/passwords.js";
import { createStaffSession, buildStaffCookie } from "../../_lib/staffSessions.js";
import { recordFailedLogin } from "../../_lib/staffUsers.js";
import { getUserPermissions, getUserRoles } from "../../_lib/rbac.js";
import { verifyTotpCode, consumeRecoveryCode, decryptTotpSecret } from "../../_lib/totp.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";
import { logAuditEvent } from "../../_lib/audit.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const username = (body.username || "").trim();
  const password = body.password || "";
  const totpCode = (body.totpCode || body.mfaCode || "").trim();

  if (!username || !password) {
    return errorJson("Usuario y contraseña requeridos", 400, "CREDENTIALS_REQUIRED");
  }

  // 1. Check if login matches Owner ENV Account
  const envAdminUser = env.AEP_ADMIN_USERNAME || "admin";
  const envAdminHash = env.AEP_ADMIN_PASSCODE_HASH;

  if (envAdminHash && (username.toLowerCase() === envAdminUser.toLowerCase())) {
    const inputHash = await sha256Hex(password);
    if (inputHash.toLowerCase() === envAdminHash.toLowerCase()) {
      // Owner ENV authenticated! Create staff session / admin cookie
      const session = await createStaffSession(db, 1, request.headers.get("User-Agent"));
      const isSecure = new URL(request.url).protocol === "https:";
      const cookieHeader = buildStaffCookie(session.token, 28800, isSecure);

      const headers = new Headers();
      headers.set("Set-Cookie", cookieHeader);

      await logAuditEvent(db, {
        actorType: "admin",
        actorIdentifier: envAdminUser,
        action: "staff.login.success",
        entityType: "staff_session",
        entityIdentifier: session.sessionId
      });

      return jsonResponse({
        ok: true,
        user: {
          id: 1,
          username: envAdminUser,
          displayName: "Owner",
          isEnvOwner: true,
          mustChangePassword: false,
          roles: [{ id: 1, name: "Owner", is_builtin: 1 }]
        }
      }, 200, headers);
    }
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

  // Upgrade legacy SHA-256 hash to PBKDF2 if applicable
  if (user.password_algo === "sha256") {
    try {
      const { hash, salt, iterations } = await hashPasswordPbkdf2(password);
      await db.prepare("UPDATE aep_users SET password_algo = 'pbkdf2-sha256', password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?")
        .bind(hash, salt, iterations, user.id).run();
    } catch {}
  }

  // 3. Check MFA TOTP if enabled
  if (user.totp_enabled === 1) {
    if (!totpCode) {
      return errorJson("Código de autenticación requerido (MFA)", 401, "MFA_REQUIRED");
    }

    const secret = await decryptTotpSecret(user.totp_secret_enc, env.AEP_MFA_ENCRYPTION_KEY);
    let totpValid = false;
    if (secret) {
      totpValid = await verifyTotpCode(secret, totpCode);
    }

    if (!totpValid) {
      // Check recovery code
      const recResult = await consumeRecoveryCode(user.recovery_codes_json, totpCode);
      if (recResult.valid) {
        totpValid = true;
        await db.prepare("UPDATE aep_users SET recovery_codes_json = ? WHERE id = ?").bind(recResult.updatedCodesJson, user.id).run();
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
      return errorJson("Código de autenticación inválido", 401, "MFA_INVALID");
    }
  }

  // Session creation
  const session = await createStaffSession(db, user.id, request.headers.get("User-Agent"));
  const isSecure = new URL(request.url).protocol === "https:";
  const cookieHeader = buildStaffCookie(session.token, 28800, isSecure);

  const roles = await getUserRoles(db, user.id);
  const permissions = await getUserPermissions(db, user.id);

  const headers = new Headers();
  headers.set("Set-Cookie", cookieHeader);

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
  }, 200, headers);
}
