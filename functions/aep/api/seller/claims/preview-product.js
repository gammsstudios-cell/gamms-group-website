// POST /aep/api/seller/claims/preview-product
import { previewClaimProduct, sanitizeRedemptionError } from "../../../_lib/redemption.js";
import { requirePosActor } from "../../../_lib/posAuth.js";
import { jsonResponse, errorJson } from "../../../_lib/adminResponses.js";

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
    return errorJson("Código de premio y token de QR físico requeridos", 400, "FIELDS_REQUIRED");
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
    customer: result.customer,
    qr: result.qr,
    product: result.product,
    pricing: result.pricing
  });
}
