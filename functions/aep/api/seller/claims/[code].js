import { previewClaim, sanitizeRedemptionError } from "../../../_lib/redemption.js";
import { requireSellerAuth } from "../../../_lib/sellerAuth.js";
import { json, safeError } from "../../../_lib/responses.js";

export async function onRequestGet(context) {
  const auth = await requireSellerAuth(context.request, context.env);
  if (!auth.ok) return safeError(auth.code, auth.status);

  const result = await previewClaim(context.env.DB, context.params.code);
  if (!result.ok) return safeError(sanitizeRedemptionError(result.code), 200);

  return json({
    ok: true,
    claim: result.claim,
    qr: result.qr,
    product: result.product,
    pricing: result.pricing
  });
}
