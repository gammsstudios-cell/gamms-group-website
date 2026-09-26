// POST /aep/api/seller/redeem
import { redeemClaim, sanitizeRedemptionError } from "../../_lib/redemption.js";
import { requirePermission } from "../../_lib/staffAuth.js";
import { getCurrentShift } from "../../_lib/shifts.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "pos.redeem");
  if (!perm.authorized) return perm.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const claimCode = body?.claimCode || body?.code || "";
  const physicalQrToken = body?.physicalQrToken || body?.qrToken || null;

  const currentShift = perm.actor.userId ? await getCurrentShift(db, perm.actor.userId) : null;

  const result = await redeemClaim(db, claimCode, {
    actorType: perm.actor.type || "seller",
    actorIdentifier: perm.actor.identifier || perm.actor.displayName || "seller",
    physicalQrToken,
    staffUserId: perm.actor.userId || null,
    shiftId: currentShift?.id || null,
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
