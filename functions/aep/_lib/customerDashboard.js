import { getCustomerIdFromRequest } from "./cookies.js";
import { formatFriendlyCustomerId } from "./customerProfile.js";
import { getPromotionRuleForProduct, countValidProductPurchases, productProgress, lookupAvailableProductReward, listAvailableCustomerRewards } from "./promotions.js";

export async function getCustomerDashboard(db, request) {
  const customerId = getCustomerIdFromRequest(request);
  if (!customerId) return { ok: false, code: "CUSTOMER_AUTH_REQUIRED" };

  const customer = await db.prepare(
    "SELECT id, display_name FROM customers WHERE id = ? LIMIT 1"
  ).bind(customerId).first();
  if (!customer) return { ok: false, code: "CUSTOMER_NOT_FOUND" };

  const summary = await db.prepare(
    `SELECT COUNT(*) AS total_purchases,
            COALESCE(SUM(final_price_cents), 0) AS total_spent_cents,
            COALESCE(SUM(regular_price_cents - final_price_cents), 0) AS total_discount_saved_cents
     FROM purchases
     WHERE customer_id = ?
       AND NOT EXISTS (SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = purchases.id)`
  ).bind(customerId).first();

  const rewardSummary = await db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS available_rewards
     FROM rewards
     WHERE customer_id = ?`
  ).bind(customerId).first();

  const purchaseRows = await db.prepare(
    `SELECT p.id, p.created_at, p.regular_price_cents, p.discount_percent, p.final_price_cents,
            pr.id AS product_id, pr.name AS product_name, q.public_number AS qr_public_number
     FROM purchases p
     JOIN products pr ON pr.id = p.product_id
     LEFT JOIN qr_codes q ON q.id = p.qr_code_id
     WHERE p.customer_id = ?
       AND NOT EXISTS (SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = p.id)
     ORDER BY p.id DESC
     LIMIT 50`
  ).bind(customerId).all();

  const rewardRows = await db.prepare(
    `SELECT r.id, r.reward_type, r.discount_percent, r.status, r.unlocked_at, r.redeemed_at,
            r.product_id, p.name AS product_name
     FROM rewards r
     LEFT JOIN products p ON p.id = r.product_id
     WHERE r.customer_id = ?
     ORDER BY r.id DESC
     LIMIT 50`
  ).bind(customerId).all();

  const productRows = await db.prepare(
    `SELECT DISTINCT p.id, p.name
     FROM products p
     LEFT JOIN purchases pur ON pur.product_id = p.id AND pur.customer_id = ?
     LEFT JOIN product_promotion_rules rules ON rules.product_id = p.id
     WHERE pur.id IS NOT NULL OR rules.id IS NOT NULL
     ORDER BY p.name ASC`
  ).bind(customerId).all();

  const promotionProgress = [];
  for (const product of productRows.results || []) {
    const rule = await getPromotionRuleForProduct(db, product.id);
    if (!rule?.enabled) continue;
    const purchaseCount = await countValidProductPurchases(db, customerId, product.id);
    const availableReward = await lookupAvailableProductReward(db, customerId, product.id);
    const progress = productProgress(purchaseCount, rule);
    const currentProgress = purchaseCount % rule.everyN;
    promotionProgress.push({
      productId: product.id,
      productName: product.name,
      currentProgress,
      everyN: rule.everyN,
      discountPercent: availableReward?.discount_percent ?? rule.discountPercent,
      repeatCycle: rule.repeatCycle !== false,
      rewardAvailable: Boolean(availableReward),
      purchaseCount: progress.purchaseCount
    });
  }

  const availableCoupons = await listAvailableCustomerRewards(db, customerId);

  return {
    ok: true,
    customer: {
      displayName: customer.display_name || null,
      customerLabel: formatFriendlyCustomerId(customer.id)
    },
    summary: {
      totalPurchases: Number(summary?.total_purchases || 0),
      totalSpentCents: Number(summary?.total_spent_cents || 0),
      totalDiscountSavedCents: Number(summary?.total_discount_saved_cents || 0),
      availableRewards: Number(rewardSummary?.available_rewards || 0)
    },
    purchases: (purchaseRows.results || []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      productId: row.product_id,
      productName: row.product_name,
      regularPriceCents: row.regular_price_cents,
      discountPercent: row.discount_percent,
      finalPriceCents: row.final_price_cents,
      qrPublicNumber: row.qr_public_number ?? null
    })),
    rewards: (rewardRows.results || []).map((row) => ({
      id: row.id,
      productId: row.product_id ?? null,
      productName: row.product_name || "GAMMS AEP",
      discountPercent: row.discount_percent,
      status: row.status,
      createdAt: row.unlocked_at,
      redeemedAt: row.redeemed_at || null
    })),
    promotionProgress,
    availableCoupons
  };
}
