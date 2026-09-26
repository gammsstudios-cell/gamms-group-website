import { redeemClaim, sanitizeRedemptionError } from "../../_lib/redemption.js";
import { requireSellerAuth } from "../../_lib/sellerAuth.js";
import { json, safeError } from "../../_lib/responses.js";

export async function onRequestPost(context) {
  const auth = await requireSellerAuth(context.request, context.env);
  if (!auth.ok) return safeError(auth.code, auth.status);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return safeError("CLAIM_INVALID", 400);
  }

  const result = await redeemClaim(context.env.DB, body?.claimCode);
  if (!result.ok) return safeError(sanitizeRedemptionError(result.code), 200);

  return json({
    ok: true,
    purchase: result.purchase,
    reward: result.reward,
    progress: result.progress
  });
}
