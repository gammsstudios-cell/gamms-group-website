// POST /aep/api/admin/purchases/[id]/void
import { requirePermission } from "../../../../_lib/staffAuth.js";
import { voidPurchase } from "../../../../_lib/voids.js";
import { jsonResponse, errorJson } from "../../../../_lib/adminResponses.js";

export async function onRequestPost(context) {
  const db = context.env.DB;
  const perm = await requirePermission(context.request, context.env, db, "purchase.void");
  if (!perm.authorized) return perm.response;

  const purchaseId = parseInt(context.params.id, 10);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const reason = body.reason || "";
  const result = await voidPurchase(db, perm.actor, purchaseId, reason);

  if (!result.valid) {
    return errorJson(result.error, 400, result.code || "VOID_FAILED");
  }

  return jsonResponse({ ok: true, purchaseId: result.purchaseId });
}
