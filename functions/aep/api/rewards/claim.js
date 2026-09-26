import { createRewardClaim } from "../../_lib/claims.js";
import { json, safeError } from "../../_lib/responses.js";

const CLAIM_ERRORS = new Set([
  "CLAIM_INVALID",
  "CLAIM_CONFLICT",
  "QR_INVALID",
  "REWARD_NOT_AVAILABLE"
]);

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return safeError("CLAIM_INVALID", 400);
  }

  try {
    const result = await createRewardClaim(context.env.DB, context.request, body?.token);
    if (!result.ok) {
      return safeError(CLAIM_ERRORS.has(result.code) ? result.code : "INTERNAL_ERROR", 200);
    }

    return json({
      ok: true,
      claim: result.claim
    });
  } catch {
    return safeError("INTERNAL_ERROR", 500);
  }
}
