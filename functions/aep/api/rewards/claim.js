import { createRewardClaim } from "../../_lib/claims.js";
import { createRewardClaimForProduct } from "../../_lib/productClaim.js";
import { lookupQrByToken } from "../../_lib/qr.js";
import { json, safeError } from "../../_lib/responses.js";

const CLAIM_ERRORS = new Set([
  "CLAIM_INVALID",
  "CLAIM_CONFLICT",
  "QR_INVALID",
  "REWARD_NOT_AVAILABLE",
  "EVENT_CLOSED"
]);

async function resolveRequestedProductId(db, request, body) {
  const explicit = Number.parseInt(body?.productId, 10);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;

  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    const url = new URL(referer);
    const parts = url.pathname.split("/").filter(Boolean);
    const promoIndex = parts.findIndex((part) => part === "promo");
    if (promoIndex < 0 || parts[promoIndex + 1] !== "r" || !parts[promoIndex + 2]) return null;

    const qr = await lookupQrByToken(db, parts[promoIndex + 2]);
    return qr.ok && qr.product?.id ? Number(qr.product.id) : null;
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  let body = {};
  try {
    const text = await context.request.text();
    if (text && text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    // Empty body is allowed in Reward V2.
  }

  try {
    const productId = body?.token
      ? null
      : await resolveRequestedProductId(context.env.DB, context.request, body);

    const result = productId
      ? await createRewardClaimForProduct(context.env.DB, context.request, productId)
      : await createRewardClaim(context.env.DB, context.request, body?.token || null);

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
