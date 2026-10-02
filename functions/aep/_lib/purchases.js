import { hashQrToken, isValidTokenFormat, normalizeToken } from "./crypto.js";
import {
  buildCustomerCookie,
  generateCustomerId as defaultGenerateCustomerId,
  getCustomerIdFromRequest
} from "./cookies.js";
import { calculateProgress } from "./progress.js";
import { requireEventActive } from "./eventGate.js";
import {
  countValidProductPurchases,
  getPromotionRuleForProduct,
  lookupAvailableProductReward,
  productProgress,
  rewardTypeForProduct
} from "./promotions.js";
import { resolvePhysicalQrInput } from "./physicalQr.js";

const REWARD_TYPE = "third_drink_50";
const REWARD_DISCOUNT_PERCENT = 50;

const EXPECTED_PURCHASE_ERRORS = new Set([
  "QR_INVALID",
  "QR_ALREADY_USED",
  "QR_DISABLED",
  "PRODUCT_NOT_FOUND",
  "OUT_OF_STOCK",
  "PURCHASE_CONFLICT",
  "REWARD_REQUIRES_SELLER",
  "EVENT_CLOSED"
]);

function normalizeInventoryActorType(actorType) {
  const value = String(actorType || "customer").slice(0, 40);
  if (value === "staff") return "seller";
  return ["admin", "seller", "system", "customer"].includes(value) ? value : "system";
}

export async function getOrCreateCustomer(db, request, options = {}) {
  const generateId = options.generateCustomerId ?? defaultGenerateCustomerId;
  const existingCustomerId = options.customerId ?? getCustomerIdFromRequest(request);
  const customerId = existingCustomerId ?? generateId();

  await db
    .prepare(
      `INSERT INTO customers (id, last_seen_at)
       VALUES (?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`
    )
    .bind(customerId)
    .run();

  return {
    customerId,
    cookie: existingCustomerId ? null : buildCustomerCookie(customerId, request)
  };
}

async function classifyQrFailure(db, tokenHash) {
  const qr = await db
    .prepare(
      `SELECT
         q.status AS status,
         q.product_id AS product_id,
         p.id AS valid_product_id,
         COALESCE(p.stock_quantity, 0) AS stock_quantity,
         purchases.id AS purchase_id
       FROM qr_codes q
       LEFT JOIN products p ON p.id = q.product_id AND p.active = 1
       LEFT JOIN purchases ON purchases.qr_code_id = q.id
       WHERE q.token_hash = ?
       LIMIT 1`
    )
    .bind(tokenHash)
    .first();

  if (!qr) return "QR_INVALID";
  if (qr.status === "used") return "QR_ALREADY_USED";
  if (qr.status === "disabled") return "QR_DISABLED";
  if (qr.purchase_id) return "PURCHASE_CONFLICT";
  if (!qr.product_id || !qr.valid_product_id) return "PRODUCT_NOT_FOUND";
  if (qr.stock_quantity <= 0) return "OUT_OF_STOCK";

  return "QR_INVALID";
}

function getFirstBatchRow(result) {
  return Array.isArray(result?.results) ? result.results[0] : null;
}

function getBatchChanges(result) {
  return Number(result?.meta?.changes ?? 0);
}

function isMissingPromotionSchemaError(error) {
  return /no such column:\s*rewards\.(product_id|promotion_rule_id)|no such column:\s*(product_id|promotion_rule_id)/i
    .test(String(error?.message || error));
}

function publicReward(reward) {
  if (!reward) return { available: false };

  return {
    available: true,
    type: reward.reward_type,
    discountPercent: reward.discount_percent
  };
}

async function lookupAvailableReward(db, customerId, productId = null) {
  if (productId) return lookupAvailableProductReward(db, customerId, productId);

  return db
    .prepare(
      `SELECT reward_type, discount_percent, cycle_number
       FROM rewards
       WHERE customer_id = ?
         AND reward_type = ?
         AND status = 'available'
       ORDER BY cycle_number ASC
       LIMIT 1`
    )
    .bind(customerId, REWARD_TYPE)
    .first();
}

async function lookupAvailableQrProduct(db, tokenHash) {
  return db.prepare(
    `SELECT q.id, q.public_number, q.product_id, q.status,
            p.id AS valid_product_id, p.name, p.price_cents, COALESCE(p.stock_quantity, 0) AS stock_quantity
     FROM qr_codes q
     LEFT JOIN products p ON p.id = q.product_id AND p.active = 1
     WHERE q.token_hash = ?
     LIMIT 1`
  ).bind(tokenHash).first();
}

function previewFromResolvedQr(resolved) {
  return {
    id: resolved.id,
    public_number: resolved.publicNumber,
    product_id: resolved.productId,
    status: resolved.status,
    valid_product_id: resolved.product?.id || null,
    name: resolved.product?.name || null,
    price_cents: resolved.product?.priceCents || 0,
    stock_quantity: resolved.product?.stockQuantity || 0
  };
}

async function createPurchaseAndConsumeQr(db, tokenHash, customerId, productId, rule = null, actor = {}, options = {}) {
  const rewardType = rule?.enabled && !rule.legacy ? rewardTypeForProduct(productId) : REWARD_TYPE;
  const everyN = rule?.enabled ? rule.everyN : 3;
  const discountPercent = rule?.enabled ? rule.discountPercent : REWARD_DISCOUNT_PERCENT;
  const repeatCycle = rule?.repeatCycle === false ? 0 : 1;
  const actorType = normalizeInventoryActorType(actor.actorType || "customer");
  const actorIdentifier = String(actor.actorIdentifier || customerId).slice(0, 120);
  const reason = String(actor.reason || "Venta cliente escaneo QR").slice(0, 240);
  const attribution = actor.staffUserId
    ? {
        staffUserId: Number(actor.staffUserId),
        shiftId: actor.shiftId ? Number(actor.shiftId) : null,
        actorType: "staff"
      }
    : null;

  const statements = [
    db
      .prepare(
        `INSERT INTO purchases (
           customer_id,
           product_id,
           qr_code_id,
           regular_price_cents,
           discount_percent,
           final_price_cents
         )
         SELECT
           ?,
           p.id,
           q.id,
           p.price_cents,
           0,
           p.price_cents
         FROM qr_codes q
         JOIN products p ON p.id = q.product_id AND p.active = 1
         WHERE q.token_hash = ?
           AND q.status = 'available'
           AND COALESCE(p.stock_quantity, 0) > 0
           AND (
             ? = 1
             OR NOT EXISTS (
             SELECT 1
             FROM rewards
             WHERE rewards.customer_id = ?
               AND rewards.status = 'available'
               AND (
                 rewards.product_id = p.id
                 OR (rewards.product_id IS NULL AND rewards.reward_type = ?)
               )
             )
           )`
      )
      .bind(customerId, tokenHash, options.allowAvailableRewardBypass ? 1 : 0, customerId, REWARD_TYPE),
    db
      .prepare(
        `UPDATE qr_codes
         SET status = 'used',
             used_at = CURRENT_TIMESTAMP
         WHERE token_hash = ?
           AND status = 'available'
           AND EXISTS (
             SELECT 1
             FROM purchases
             WHERE purchases.qr_code_id = qr_codes.id
           )
         RETURNING id, product_id, public_number`
      )
      .bind(tokenHash),
    db
      .prepare(
        `INSERT INTO rewards (
           customer_id,
           reward_type,
           discount_percent,
           status,
           cycle_number,
           product_id,
           promotion_rule_id
         )
         SELECT
           ?,
           ?,
           ?,
           'available',
           totals.cycle_number,
           ?,
           ?
         FROM (
           SELECT
             COUNT(*) AS purchase_count,
             CAST(((COUNT(*) - 1) / ?) + 1 AS INTEGER) AS cycle_number
           FROM purchases
           WHERE customer_id = ?
             AND product_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = purchases.id
             )
         ) totals
         WHERE ? = 1
            AND (? = 1 OR totals.cycle_number = 1)
            AND totals.purchase_count > 0
            AND totals.purchase_count % ? = (? - 1)
            AND NOT EXISTS (
              SELECT 1
              FROM rewards
              WHERE rewards.customer_id = ?
                AND rewards.reward_type = ?
                AND rewards.cycle_number = totals.cycle_number
                AND rewards.status = 'available'
            )
         ON CONFLICT (customer_id, reward_type, cycle_number) DO UPDATE
         SET status = 'available',
             redeemed_at = NULL,
             redeemed_purchase_id = NULL
         WHERE rewards.status = 'cancelled'
         RETURNING reward_type, discount_percent, cycle_number`
      )
      .bind(
        customerId,
        rewardType,
        discountPercent,
        productId,
        rule?.id ?? null,
        everyN,
        customerId,
        productId,
        rule?.enabled ? 1 : 0,
        repeatCycle,
        everyN,
        everyN,
        customerId,
        rewardType
      ),
    db
      .prepare(
        `UPDATE products
         SET stock_quantity = stock_quantity - 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = (
           SELECT product_id
           FROM qr_codes
           WHERE token_hash = ?
         )
         AND stock_quantity > 0
         AND EXISTS (
           SELECT 1
           FROM purchases p
           JOIN qr_codes q ON q.id = p.qr_code_id
           WHERE q.token_hash = ?
         )`
      )
      .bind(tokenHash, tokenHash),
    db
      .prepare(
        `INSERT INTO inventory_movements (
           product_id,
           movement_type,
           quantity_delta,
           reason,
           purchase_id,
           actor_type,
           actor_identifier,
           created_at
         )
         SELECT
           p.product_id,
           'sale',
           -1,
           ?,
           p.id,
           ?,
           ?,
           CURRENT_TIMESTAMP
         FROM purchases p
         JOIN qr_codes q ON q.id = p.qr_code_id
         WHERE q.token_hash = ?`
      )
      .bind(reason, actorType, actorIdentifier, tokenHash)
  ];

  if (attribution) {
    statements.push(
      db.prepare(
        `INSERT OR REPLACE INTO purchase_attribution (
           purchase_id,
           staff_user_id,
           shift_id,
           actor_type
         )
         SELECT
           p.id,
           ?,
           ?,
           ?
         FROM purchases p
         JOIN qr_codes q ON q.id = p.qr_code_id
         WHERE q.token_hash = ?
         LIMIT 1`
      ).bind(attribution.staffUserId, attribution.shiftId, attribution.actorType, tokenHash)
    );
  }

  const [insertResult, updateResult, rewardResult, stockResult, inventoryResult, attributionResult] = await db.batch(statements);

  const consumedQr = getFirstBatchRow(updateResult);

  if (
    getBatchChanges(insertResult) !== 1 ||
    !consumedQr ||
    getBatchChanges(stockResult) !== 1 ||
    getBatchChanges(inventoryResult) !== 1 ||
    (attribution && getBatchChanges(attributionResult) !== 1)
  ) {
    return null;
  }

  return {
    consumedQr,
    unlockedReward: getFirstBatchRow(rewardResult)
  };
}

async function createLegacyPurchaseAndConsumeQr(db, tokenHash, customerId, actor = {}) {
  const actorType = normalizeInventoryActorType(actor.actorType || "customer");
  const actorIdentifier = String(actor.actorIdentifier || customerId).slice(0, 120);
  const reason = String(actor.reason || "Venta cliente escaneo QR").slice(0, 240);

  const [insertResult, updateResult, rewardResult, stockResult, inventoryResult] = await db.batch([
    db.prepare(
      `INSERT INTO purchases (
         customer_id,
         product_id,
         qr_code_id,
         regular_price_cents,
         discount_percent,
         final_price_cents
       )
       SELECT
         ?,
         p.id,
         q.id,
         p.price_cents,
         0,
         p.price_cents
       FROM qr_codes q
       JOIN products p ON p.id = q.product_id AND p.active = 1
       WHERE q.token_hash = ?
         AND q.status = 'available'
         AND COALESCE(p.stock_quantity, 0) > 0
         AND NOT EXISTS (
           SELECT 1
           FROM rewards
           WHERE rewards.customer_id = ?
             AND rewards.reward_type = ?
             AND rewards.status = 'available'
         )`
    ).bind(customerId, tokenHash, customerId, REWARD_TYPE),
    db.prepare(
      `UPDATE qr_codes
       SET status = 'used',
           used_at = CURRENT_TIMESTAMP
       WHERE token_hash = ?
         AND status = 'available'
         AND EXISTS (
           SELECT 1
           FROM purchases
           WHERE purchases.qr_code_id = qr_codes.id
         )
       RETURNING id, product_id, public_number`
    ).bind(tokenHash),
    db.prepare(
      `INSERT INTO rewards (
         customer_id,
         reward_type,
         discount_percent,
         status,
         cycle_number
       )
       SELECT
         ?,
         ?,
         ?,
         'available',
         totals.cycle_number
       FROM (
         SELECT
           COUNT(*) AS purchase_count,
           CAST(((COUNT(*) - 1) / 3) + 1 AS INTEGER) AS cycle_number
         FROM purchases
         WHERE customer_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = purchases.id
           )
       ) totals
       WHERE totals.purchase_count > 0
          AND totals.purchase_count % 3 = 2
          AND NOT EXISTS (
            SELECT 1
            FROM rewards
            WHERE rewards.customer_id = ?
              AND rewards.reward_type = ?
              AND rewards.cycle_number = totals.cycle_number
              AND rewards.status = 'available'
          )
       ON CONFLICT (customer_id, reward_type, cycle_number) DO UPDATE
       SET status = 'available',
           redeemed_at = NULL,
           redeemed_purchase_id = NULL
       WHERE rewards.status = 'cancelled'
       RETURNING reward_type, discount_percent, cycle_number`
    ).bind(customerId, REWARD_TYPE, REWARD_DISCOUNT_PERCENT, customerId, customerId, REWARD_TYPE),
    db.prepare(
      `UPDATE products
       SET stock_quantity = stock_quantity - 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT product_id
         FROM qr_codes
         WHERE token_hash = ?
       )
       AND stock_quantity > 0
       AND EXISTS (
         SELECT 1
         FROM purchases p
         JOIN qr_codes q ON q.id = p.qr_code_id
         WHERE q.token_hash = ?
       )`
    ).bind(tokenHash, tokenHash),
    db.prepare(
      `INSERT INTO inventory_movements (
         product_id,
         movement_type,
         quantity_delta,
         reason,
         purchase_id,
         actor_type,
         actor_identifier,
         created_at
       )
       SELECT
         p.product_id,
         'sale',
         -1,
         ?,
         p.id,
         ?,
         ?,
         CURRENT_TIMESTAMP
       FROM purchases p
       JOIN qr_codes q ON q.id = p.qr_code_id
       WHERE q.token_hash = ?`
    ).bind(reason, actorType, actorIdentifier, tokenHash)
  ]);

  const consumedQr = getFirstBatchRow(updateResult);

  if (
    getBatchChanges(insertResult) !== 1 ||
    !consumedQr ||
    getBatchChanges(stockResult) !== 1 ||
    getBatchChanges(inventoryResult) !== 1
  ) {
    return null;
  }

  return {
    consumedQr,
    unlockedReward: getFirstBatchRow(rewardResult)
  };
}

async function lookupProduct(db, productId) {
  return db
    .prepare(
      `SELECT id, name, price_cents
       FROM products
       WHERE id = ?
         AND active = 1
       LIMIT 1`
    )
    .bind(productId)
    .first();
}

export async function registerPurchase(db, request, rawToken, options = {}) {
  const event = await requireEventActive(db);
  if (!event.ok) return { ok: false, code: event.code };

  let tokenHash;
  let qrPreview;
  if (options.allowPhysicalQrInput) {
    const resolved = await resolvePhysicalQrInput(db, rawToken);
    if (!resolved.ok) return { ok: false, code: resolved.code };
    tokenHash = resolved.qr.tokenHash;
    qrPreview = previewFromResolvedQr(resolved.qr);
  } else {
    const token = normalizeToken(rawToken);
    if (!isValidTokenFormat(token)) {
      return { ok: false, code: "QR_INVALID" };
    }
    tokenHash = await hashQrToken(token);
    qrPreview = await lookupAvailableQrProduct(db, tokenHash);
  }

  const customer = await getOrCreateCustomer(db, request, options);
  if (!qrPreview || qrPreview.status !== "available" || !qrPreview.valid_product_id || qrPreview.stock_quantity <= 0) {
    return {
      ok: false,
      code: await classifyQrFailure(db, tokenHash),
      customerCookie: customer.cookie
    };
  }

  const rule = await getPromotionRuleForProduct(db, qrPreview.product_id);

  let purchaseTransaction;

  try {
    purchaseTransaction = await createPurchaseAndConsumeQr(db, tokenHash, customer.customerId, qrPreview.product_id, rule, options.actor, {
      allowAvailableRewardBypass: true
    });
  } catch (error) {
    if (isMissingPromotionSchemaError(error)) {
      try {
        purchaseTransaction = await createLegacyPurchaseAndConsumeQr(db, tokenHash, customer.customerId, options.actor);
      } catch {
        return {
          ok: false,
          code: "PURCHASE_CONFLICT",
          customerCookie: customer.cookie
        };
      }
    } else {
      return {
        ok: false,
        code: "PURCHASE_CONFLICT",
        customerCookie: customer.cookie
      };
    }
  }

  if (purchaseTransaction === undefined) {
    return {
      ok: false,
      code: "PURCHASE_CONFLICT",
      customerCookie: customer.cookie
    };
  }

  if (!purchaseTransaction) {
    return {
      ok: false,
      code: await classifyQrFailure(db, tokenHash),
      customerCookie: customer.cookie
    };
  }

  const { consumedQr, unlockedReward } = purchaseTransaction;
  const product = await lookupProduct(db, consumedQr.product_id);

  if (!product) {
    return {
      ok: false,
      code: "PRODUCT_NOT_FOUND",
      customerCookie: customer.cookie
    };
  }

  const productPurchaseCount = await countValidProductPurchases(db, customer.customerId, consumedQr.product_id);
  const progress = rule?.enabled && !rule.legacy
    ? productProgress(productPurchaseCount, rule)
    : calculateProgress(productPurchaseCount);
  const currentReward = unlockedReward ?? await lookupAvailableReward(db, customer.customerId, consumedQr.product_id);

  return {
    ok: true,
    customerCookie: customer.cookie,
    purchase: {
      qrNumber: consumedQr.public_number,
      product: {
        id: product.id,
        name: product.name
      },
      priceCents: product.price_cents,
      discountPercent: 0,
      finalPriceCents: product.price_cents
    },
    progress: {
      ...progress,
      reward: publicReward(currentReward)
    }
  };
}

export function sanitizePurchaseError(error) {
  return EXPECTED_PURCHASE_ERRORS.has(error) ? error : "INTERNAL_ERROR";
}
