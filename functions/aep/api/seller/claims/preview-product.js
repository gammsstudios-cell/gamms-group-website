// POST /aep/api/seller/claims/preview-product
import { previewClaim, previewClaimProduct, sanitizeRedemptionError } from "../../../_lib/redemption.js";
import { requirePosActor } from "../../../_lib/posAuth.js";
import { jsonResponse, errorJson } from "../../../_lib/adminResponses.js";

function normalizePricing(result, claimPreview) {
  const regularPriceCents = Number(result?.pricing?.regularPriceCents ?? 0);
  const rawDiscount = claimPreview?.reward?.discountPercent
    ?? claimPreview?.pricing?.discountPercent
    ?? result?.pricing?.discountPercent;
  const discountPercent = Number(rawDiscount);

  if (!Number.isFinite(regularPriceCents) || !Number.isFinite(discountPercent)) {
    return result?.pricing || null;
  }

  const safeDiscount = Math.min(100, Math.max(0, discountPercent));
  return {
    ...result.pricing,
    regularPriceCents,
    discountPercent: safeDiscount,
    finalPriceCents: Math.round(regularPriceCents * (100 - safeDiscount) / 100)
  };
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const auth = await requirePosActor(request, env, db);
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const claimCode = body.code || body.claimCode || "";
  const physicalQrToken = body.physicalQrToken || body.qrToken || "";

  if (!claimCode || !physicalQrToken) {
    return errorJson("Código de premio y QR físico requeridos", 400, "FIELDS_REQUIRED");
  }

  // Read the claim separately so legacy pre-linked claims use the reward's
  // current percentage instead of any historical UI/default fallback.
  const claimPreview = await previewClaim(db, claimCode);
  if (!claimPreview.ok) {
    return jsonResponse({
      ok: false,
      code: sanitizeRedemptionError(claimPreview.code),
      error: claimPreview.error || "No se pudo validar el premio"
    }, 200);
  }

  const result = await previewClaimProduct(db, claimCode, physicalQrToken);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      code: sanitizeRedemptionError(result.code),
      error: result.error || "No se pudo previsualizar la bebida escaneada"
    }, 200);
  }

  return jsonResponse({
    ok: true,
    claim: result.claim,
    customer: result.customer || claimPreview.customer || null,
    qr: result.qr,
    product: result.product,
    pricing: normalizePricing(result, claimPreview)
  });
}
