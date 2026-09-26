import { buildAdminCookie, createAdminSession, loginAdmin } from "../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../_lib/adminResponses.js";
import { logAuditEvent } from "../../_lib/audit.js";

export async function onRequestPost(context) {
  const csrf = validateCsrf(context.request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const loginResult = await loginAdmin(context.env, body?.passcode);
  if (!loginResult.ok) {
    return adminError(loginResult.code, loginResult.status);
  }

  const sessionToken = await createAdminSession(context.env, "admin");
  const cookie = buildAdminCookie(sessionToken, context.request);

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: "admin",
    action: "admin_login",
    entityType: "session"
  });

  return adminJson(
    { ok: true, message: "Admin session created" },
    { headers: { "set-cookie": cookie } }
  );
}
