// POST /aep/api/staff/change-password
import { authenticateStaff } from "../../_lib/staffAuth.js";
import { verifyPassword, hashPasswordPbkdf2 } from "../../_lib/passwords.js";
import { validatePassword } from "../../_lib/staffUsers.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";
import { sha256Hex } from "../../_lib/crypto.js";
import { logAuditEvent } from "../../_lib/audit.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const auth = await authenticateStaff(request, env, db);

  if (!auth.authenticated) {
    return errorJson("Autenticación requerida", 401, "STAFF_AUTH_REQUIRED");
  }

  if (auth.session.isEnvOwner) {
    return errorJson("La contraseña del usuario Owner se administra mediante Cloudflare ENV", 400, "ENV_OWNER_IMMUTABLE");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  if (typeof body?.currentPassword !== "string" || typeof body?.newPassword !== "string") {
    return errorJson("Contraseña actual y nueva contraseña son requeridas", 400, "FIELDS_REQUIRED");
  }

  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;

  if (!currentPassword || !newPassword) {
    return errorJson("Contraseña actual y nueva contraseña son requeridas", 400, "FIELDS_REQUIRED");
  }

  const user = await db.prepare("SELECT username, password_hash, password_algo, password_salt, password_iterations FROM aep_users WHERE id = ?")
    .bind(auth.session.userId).first();

  if (!user) {
    return errorJson("Usuario no encontrado", 404, "USER_NOT_FOUND");
  }

  const validCurr = await verifyPassword(currentPassword, user.password_hash, user.password_algo, user.password_salt, user.password_iterations);
  if (!validCurr) {
    return errorJson("La contraseña actual es incorrecta", 400, "CURRENT_PASSWORD_INVALID");
  }

  const passVal = validatePassword(newPassword);
  if (!passVal.valid) {
    return errorJson(passVal.error, 400, "NEW_PASSWORD_INVALID");
  }

  const { hash, salt, iterations } = await hashPasswordPbkdf2(newPassword);
  await db.prepare(`
    UPDATE aep_users
    SET password_algo = 'pbkdf2-sha256',
        password_hash = ?,
        password_salt = ?,
        password_iterations = ?,
        must_change_password = 0,
        failed_login_count = 0,
        locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(hash, salt, iterations, auth.session.userId).run();

  // Revoke other active sessions for this user
  if (auth.session.sessionToken) {
    const currentTokenHash = await sha256Hex(auth.session.sessionToken);
    await db.prepare("DELETE FROM aep_staff_sessions WHERE user_id = ? AND token_hash != ?")
      .bind(auth.session.userId, currentTokenHash).run();
  }

  await logAuditEvent(db, {
    actorType: "staff",
    actorIdentifier: user.username,
    action: "password.changed",
    entityType: "staff_user",
    entityIdentifier: String(auth.session.userId)
  });

  return jsonResponse({ ok: true, message: "Contraseña actualizada exitosamente" });
}
