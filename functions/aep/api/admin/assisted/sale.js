import { requirePermission } from "../../../_lib/staffAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { registerPurchase, sanitizePurchaseError } from "../../../_lib/purchases.js";
import { getCurrentShift } from "../../../_lib/shifts.js";
import { requireEventActive } from "../../../_lib/eventGate.js";
import { resolvePhysicalQrInput } from "../../../_lib/physicalQr.js";
import {
  countValidProductPurchases,
  getPromotionRuleForProduct,
  lookupAvailableProductReward,
  productProgress
} from "../../../_lib/promotions.js";
import { generateClaimCode, hashClaimCode } from "../../../_lib/claims.js";
import { redeemClaim, sanitizeRedemptionError } from "../../../_lib/redemption.js";

function sanitizeAssistedRewardError(code) {
  if (code === "REWARD_REQUIRES_SELLER") return code;
  return sanitizeRedemptionError(code);
}

async function createInternalAssistedClaim(db, { rewardId, customerId, qrId }) {
  // Do not replace an active customer-facing claim. If one already exists,
  // the seller should use the normal POS claim flow instead of invalidating it.
  await db.prepare(
    `UPDATE reward_claims
     SET status = 'expired'
     WHERE reward_id = ?
       AND status = 'available'
       AND expires_at <= CURRENT_TIMESTAMP`
  ).bind(rewardId).run();

  const existing = await db.prepare(
    `SELECT id
     FROM reward_claims
     WHERE reward_id = ? AND status = 'available'
     LIMIT 1`
  ).bind(rewardId).first();
  if (existing) return { ok: false, code: "REWARD_REQUIRES_SELLER" };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateClaimCode();
    const tokenHash = await hashClaimCode(code);

    try {
      const inserted = await db.prepare(
        `INSERT INTO reward_claims (
           reward_id, customer_id, qr_code_id, token_hash, status, expires_at
         )
         SELECT
           r.id, ?, q.id, ?, 'available',
           strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+5 minutes')
         FROM rewards r
         JOIN qr_codes q ON q.id = ? AND q.status = 'available'
         JOIN products p ON p.id = q.product_id AND p.active = 1
         WHERE r.id = ?
           AND r.customer_id = ?
           AND r.status = 'available'
           AND (r.product_id IS NULL OR r.product_id = q.product_id)
           AND COALESCE(p.stock_quantity, 0) > 0
         RETURNING id`
      ).bind(customerId, tokenHash, qrId, rewardId, customerId).first();

      if (inserted) return { ok: true, code, tokenHash };
      return { ok: false, code: "REWARD_NOT_AVAILABLE" };
    } catch (error) {
      const message = String(error?.message || error);
      if (/token_hash|UNIQUE.*token/i.test(message)) continue;
      if (/UNIQUE|constraint/i.test(message)) return { ok: false, code: "REDEMPTION_CONFLICT" };
      return { ok: false, code: "REDEMPTION_CONFLICT" };
    }
  }

  return { ok: false, code: "REDEMPTION_CONFLICT" };
}

async function cancelInternalClaim(db, tokenHash) {
  if (!tokenHash) return;
  await db.prepare(
    `UPDATE reward_claims
     SET status = 'cancelled'
     WHERE token_hash = ? AND status = 'available'`
  ).bind(tokenHash).run().catch(() => {});
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "pos.access");
  if (!perm.authorized) return perm.response;

  const csrf = validateCsrf(request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body;
  try {
    body = await request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const customerId = String(body?.customerId || "").trim();
  const token = body?.token;
  if (!customerId) return adminError("CUSTOMER_REQUIRED", 400);

  const event = await requireEventActive(db);
  if (!event.ok) return adminError(event.code, 409);

  const customer = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!customer) return adminError("CUSTOMER_NOT_FOUND", 404);

  const resolved = await resolvePhysicalQrInput(db, token);
  if (!resolved.ok) return adminError(sanitizePurchaseError(resolved.code), 400);

  const staffUserId = perm.actor?.userId || null;
  const shift = staffUserId ? await getCurrentShift(db, staffUserId) : null;
  const actorIdentifier = perm.actor?.identifier || perm.actor?.displayName || "staff";

  // If this customer already has an available reward for the scanned product,
  // Venta Asistida is itself a seller-authorized flow, so redeem it server-side.
  // No percentage or price is accepted from the browser.
  const availableReward = await lookupAvailableProductReward(db, customerId, resolved.qr.productId);
  if (availableReward) {
    const internalClaim = await createInternalAssistedClaim(db, {
      rewardId: availableReward.id,
      customerId,
      qrId: resolved.qr.id
    });

    if (!internalClaim.ok) {
      return adminError(sanitizeAssistedRewardError(internalClaim.code), 409, internalClaim);
    }

    const redeemed = await redeemClaim(db, internalClaim.code, {
      actorType: "seller",
      actorIdentifier,
      staffUserId,
      shiftId: shift?.id || null,
      movementReason: "Venta asistida con promoción",
      audit: true
    });

    if (!redeemed.ok) {
      await cancelInternalClaim(db, internalClaim.tokenHash);
      return adminError(sanitizeRedemptionError(redeemed.code), 409, redeemed);
    }

    const rule = await getPromotionRuleForProduct(db, resolved.qr.productId);
    const purchaseCount = await countValidProductPurchases(db, customerId, resolved.qr.productId);
    const progress = availableReward.promotion_rule_id && rule?.enabled && !rule.legacy
      ? productProgress(purchaseCount, rule)
      : redeemed.progress;

    return adminJson({
      ok: true,
      purchase: redeemed.purchase,
      progress,
      promotionApplied: true
    });
  }

  const result = await registerPurchase(db, request, token, {
    customerId,
    allowPhysicalQrInput: true,
    actor: {
      actorType: "staff",
      actorIdentifier,
      reason: "Venta asistida",
      staffUserId,
      shiftId: shift?.id || null
    }
  });

  if (!result.ok) return adminError(sanitizePurchaseError(result.code), 400, result);

  return adminJson({
    ok: true,
    purchase: result.purchase,
    progress: result.progress,
    promotionApplied: false
  });
}
