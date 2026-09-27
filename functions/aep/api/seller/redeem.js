// POST /aep/api/seller/redeem
import { redeemClaim, sanitizeRedemptionError } from "../../_lib/redemption.js";
import { requirePosActor } from "../../_lib/posAuth.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";

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

  const claimCode = body?.claimCode || body?.code || "";
  const physicalQrToken = body?.physicalQrToken || body?.qrToken || null;

  const result = await redeemClaim(db, claimCode, {
    actorType: auth.actorType,
    actorIdentifier: auth.actorIdentifier,
    physicalQrToken,
    staffUserId: auth.staffUserId,
    shiftId: auth.shiftId,
    audit: true
  });

  if (!result.ok) {
    return jsonResponse({
      ok: false,
      code: sanitizeRedemptionError(result.code),
      error: result.error || "No se pudo completar el canje"
    }, 200);
  }

  return jsonResponse({
    ok: true,
    purchase: result.purchase,
    customer: result.customer,
    reward: result.reward,
    progress: result.progress
  });
}
