import { requirePermission } from "../../../_lib/staffAuth.js";
import { adminError, adminJson } from "../../../_lib/adminResponses.js";
import { resolvePhysicalQrInput } from "../../../_lib/physicalQr.js";
import { requireEventActive } from "../../../_lib/eventGate.js";

function calculateFinalPrice(regularPriceCents, discountPercent) {
  return Math.round(Number(regularPriceCents) * (100 - Number(discountPercent)) / 100);
}

export async function onRequestGet({ request, env }) {
  const perm = await requirePermission(request, env, env.DB, "pos.access");
  if (!perm.authorized) return perm.response;

  const event = await requireEventActive(env.DB);
  if (!event.ok) return adminError(event.code, 409);

  const url = new URL(request.url);
  const input = url.searchParams.get("input") || "";
  const customerId = String(url.searchParams.get("customerId") || "").trim();
  const rewardId = Number.parseInt(url.searchParams.get("rewardId") || "", 10);

  const result = await resolvePhysicalQrInput(env.DB, input);
  if (!result.ok) return adminError(result.code, 400);

  let reward = null;
  if (customerId) {
    const customer = await env.DB.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
    if (!customer) return adminError("CUSTOMER_NOT_FOUND", 404);
    if (Number.isInteger(rewardId)) {
      reward = await env.DB.prepare(
        `SELECT id, discount_percent, cycle_number, product_id, unlocked_at
         FROM rewards
         WHERE id = ?
           AND customer_id = ?
           AND status = 'available'
           AND (product_id IS NULL OR product_id = ?)
         LIMIT 1`
      ).bind(rewardId, customerId, result.qr.productId).first();
      if (!reward) return adminError("REWARD_NOT_AVAILABLE", 409);
    }
  }

  const regularPriceCents = Number(result.qr.product.priceCents || 0);
  const discountPercent = reward ? Number(reward.discount_percent || 0) : 0;

  return adminJson({
    ok: true,
    qr: {
      publicNumber: result.qr.publicNumber,
      status: result.qr.status
    },
    product: result.qr.product,
    pricing: {
      regularPriceCents,
      discountPercent,
      finalPriceCents: calculateFinalPrice(regularPriceCents, discountPercent),
      rewardAvailable: Boolean(reward),
      rewardId: reward?.id || null
    }
  });
}
