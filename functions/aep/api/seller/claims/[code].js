// GET /aep/api/seller/claims/[code]
import { previewClaim, sanitizeRedemptionError } from "../../../_lib/redemption.js";
import { requirePermission } from "../../../_lib/staffAuth.js";
import { jsonResponse, errorJson } from "../../../_lib/adminResponses.js";

export async function onRequestGet(context) {
  const db = context.env.DB;
  const perm = await requirePermission(context.request, context.env, db, "pos.access");
  if (!perm.authorized) return perm.response;

  const result = await previewClaim(db, context.params.code);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      code: sanitizeRedemptionError(result.code),
      error: result.error || "Claim no disponible"
    }, 200);
  }

  return jsonResponse({
    ok: true,
    claim: result.claim,
    customer: result.customer,
    reward: result.reward,
    preLinkedQr: result.preLinkedQr || null,
    pricing: result.pricing || null
  });
}
