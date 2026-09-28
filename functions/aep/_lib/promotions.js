import { getSettings } from "./settings.js";

export function rewardTypeForProduct(productId) {
  return `product_${Number(productId)}_discount`;
}

export async function getPromotionRuleForProduct(db, productId) {
  const rule = await db.prepare(
    `SELECT r.id, r.product_id, r.enabled, r.every_n_purchases, r.discount_percent, r.repeat_cycle,
            p.name AS product_name
     FROM product_promotion_rules r
     JOIN products p ON p.id = r.product_id
     WHERE r.product_id = ?
     LIMIT 1`
  ).bind(productId).first().catch(() => null);

  if (rule) {
    return {
      id: rule.id,
      productId: rule.product_id,
      enabled: Boolean(rule.enabled),
      everyN: Number(rule.every_n_purchases),
      discountPercent: Number(rule.discount_percent),
      repeatCycle: Boolean(rule.repeat_cycle),
      productName: rule.product_name
    };
  }

  const settings = await getSettings(db);
  if (settings.rewards_enabled === "false") return null;

  return {
    id: null,
    productId: Number(productId),
    enabled: true,
    everyN: Math.max(2, Number.parseInt(settings.reward_every_n_purchases, 10) || 3),
    discountPercent: Math.min(100, Math.max(1, Number.parseInt(settings.reward_discount_percent, 10) || 50)),
    repeatCycle: true,
    productName: null,
    legacy: true
  };
}

export async function countValidProductPurchases(db, customerId, productId) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS purchase_count
     FROM purchases
     WHERE customer_id = ?
       AND product_id = ?
       AND NOT EXISTS (SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = purchases.id)`
  ).bind(customerId, productId).first();
  return Number(row?.purchase_count || 0);
}

export function productProgress(purchaseCount, rule) {
  if (!rule?.enabled) {
    return { purchaseCount, cyclePosition: 0, reward: { available: false } };
  }
  const cyclePosition = ((purchaseCount - 1) % rule.everyN) + 1;
  return { purchaseCount, cyclePosition, everyN: rule.everyN, reward: { available: false } };
}

export async function lookupAvailableProductReward(db, customerId, productId) {
  try {
    return await db.prepare(
      `SELECT id, reward_type, discount_percent, cycle_number, product_id, promotion_rule_id
       FROM rewards
       WHERE customer_id = ?
         AND status = 'available'
         AND (
           product_id = ?
           OR (product_id IS NULL AND reward_type = 'third_drink_50')
         )
       ORDER BY product_id IS NULL ASC, cycle_number ASC
       LIMIT 1`
    ).bind(customerId, productId).first();
  } catch (error) {
    if (!/no such column|no such table/i.test(String(error?.message || error))) {
      throw error;
    }
    return db.prepare(
      `SELECT id, reward_type, discount_percent, cycle_number
       FROM rewards
       WHERE customer_id = ?
         AND reward_type = 'third_drink_50'
         AND status = 'available'
       ORDER BY cycle_number ASC
       LIMIT 1`
    ).bind(customerId).first();
  }
}

export async function upsertProductPromotionRule(db, data) {
  const productId = Number.parseInt(data.productId, 10);
  const everyN = Number.parseInt(data.everyN ?? data.every_n_purchases, 10);
  const discountPercent = Number.parseInt(data.discountPercent ?? data.discount_percent, 10);
  const enabled = data.enabled === true || data.enabled === 1 ? 1 : 0;
  const repeatCycle = data.repeatCycle === false || data.repeat_cycle === 0 ? 0 : 1;

  if (!Number.isInteger(productId) || productId < 1) return { ok: false, code: "INVALID_PRODUCT" };
  if (!Number.isInteger(everyN) || everyN < 2) return { ok: false, code: "INVALID_EVERY_N" };
  if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) return { ok: false, code: "INVALID_DISCOUNT" };

  const product = await db.prepare("SELECT id, name FROM products WHERE id = ? LIMIT 1").bind(productId).first();
  if (!product) return { ok: false, code: "PRODUCT_NOT_FOUND" };

  const row = await db.prepare(
    `INSERT INTO product_promotion_rules (
       product_id, enabled, every_n_purchases, discount_percent, repeat_cycle, updated_at
     )
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(product_id) DO UPDATE SET
       enabled = excluded.enabled,
       every_n_purchases = excluded.every_n_purchases,
       discount_percent = excluded.discount_percent,
       repeat_cycle = excluded.repeat_cycle,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, product_id, enabled, every_n_purchases, discount_percent, repeat_cycle`
  ).bind(productId, enabled, everyN, discountPercent, repeatCycle).first();

  return { ok: true, rule: row };
}

export async function listProductPromotionRules(db) {
  const rows = await db.prepare(
    `SELECT p.id AS product_id, p.name AS product_name,
            r.id AS rule_id, r.enabled, r.every_n_purchases, r.discount_percent, r.repeat_cycle, r.updated_at
     FROM products p
     LEFT JOIN product_promotion_rules r ON r.product_id = p.id
     ORDER BY p.active DESC, p.name ASC`
  ).all();

  return (rows?.results || []).map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    ruleId: row.rule_id || null,
    enabled: Boolean(row.enabled),
    everyN: row.every_n_purchases || 3,
    discountPercent: row.discount_percent || 50,
    repeatCycle: row.repeat_cycle !== 0,
    updatedAt: row.updated_at || null
  }));
}
