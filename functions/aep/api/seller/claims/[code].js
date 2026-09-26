// GET /aep/api/seller/claims/[code]
import { previewClaim, sanitizeRedemptionError } from "../../../_lib/redemption.js";
import { requireSellerAuth } from "../../../_lib/sellerAuth.js";
import { jsonResponse, errorJson } from "../../../_lib/adminResponses.js";

export async function onRequestGet(context) {
  const db = context.env.DB;
  const auth = await requireSellerAuth(context.request, context.env);
  if (!auth.ok) return errorJson(auth.code, auth.status);

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
