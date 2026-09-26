import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { logAuditEvent } from "../../../_lib/audit.js";
import { updateSellerAccount } from "../../../_lib/sellers.js";

export async function onRequestPut(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const csrf = validateCsrf(context.request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  const sellerId = context.params.id;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const result = await updateSellerAccount(context.env.DB, sellerId, {
    displayName: body?.displayName ?? body?.display_name,
    active: body?.active
  });

  if (!result.ok) {
    return adminError(result.code, 400, result.message);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "seller_updated",
    entityType: "seller",
    entityIdentifier: String(sellerId),
    metadata: { active: body?.active }
  });

  return adminJson({ ok: true, sellerId: Number(sellerId) });
}
