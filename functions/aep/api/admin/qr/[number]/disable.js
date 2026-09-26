import { requireAdminAuth } from "../../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../../_lib/adminResponses.js";
import { disableQr } from "../../../../_lib/adminQr.js";
import { logAuditEvent } from "../../../../_lib/audit.js";

export async function onRequestPost(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const csrf = validateCsrf(context.request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  const publicNumber = context.params.number;
  const result = await disableQr(context.env.DB, publicNumber);
  if (!result.ok) {
    return adminError(result.code, 400, result.message);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "qr_disabled",
    entityType: "qr_code",
    entityIdentifier: String(publicNumber)
  });

  return adminJson({ ok: true, qr: result.qr });
}
