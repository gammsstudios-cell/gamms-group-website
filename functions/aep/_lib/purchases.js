import { hashQrToken, isValidTokenFormat, normalizeToken } from "./crypto.js";
import {
  buildCustomerCookie,
  generateCustomerId as defaultGenerateCustomerId,
  getCustomerIdFromRequest
} from "./cookies.js";
import { calculateProgress } from "./progress.js";

const REWARD_TYPE = "third_drink_50";
const REWARD_DISCOUNT_PERCENT = 50;

const EXPECTED_PURCHASE_ERRORS = new Set([
  "QR_INVALID",
  "QR_ALREADY_USED",
  "QR_DISABLED",
  "PRODUCT_NOT_FOUND",
  "OUT_OF_STOCK",
  "PURCHASE_CONFLICT",
  "REWARD_REQUIRES_SELLER"
]);

export async function getOrCreateCustomer(db, request, options = {}) {
  const generateId = options.generateCustomerId ?? defaultGenerateCustomerId;
  const existingCustomerId = getCustomerIdFromRequest(request);
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

function publicReward(reward) {
  if (!reward) return { available: false };

  return {
    available: true,
    type: reward.reward_type,
    discountPercent: reward.discount_percent
  };
}

async function lookupAvailableReward(db, customerId) {
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

async function createPurchaseAndConsumeQr(db, tokenHash, customerId) {
  const [insertResult, updateResult, rewardResult, stockResult, inventoryResult] = await db.batch([
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
           AND NOT EXISTS (
             SELECT 1
             FROM rewards
             WHERE rewards.customer_id = ?
               AND rewards.reward_type = ?
               AND rewards.status = 'available'
           )`
      )
      .bind(customerId, tokenHash, customerId, REWARD_TYPE),
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
         ) totals
         WHERE totals.purchase_count > 0
            AND totals.purchase_count % 3 = 2
            AND NOT EXISTS (
              SELECT 1
              FROM rewards
              WHERE rewards.customer_id = ?
                AND rewards.reward_type = ?
                AND rewards.cycle_number = totals.cycle_number
            )
         RETURNING reward_type, discount_percent, cycle_number`
      )
      .bind(
        customerId,
        REWARD_TYPE,
        REWARD_DISCOUNT_PERCENT,
        customerId,
        customerId,
        REWARD_TYPE
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
           'Venta cliente escaneo QR',
           p.id,
           'customer',
           ?,
           CURRENT_TIMESTAMP
         FROM purchases p
         JOIN qr_codes q ON q.id = p.qr_code_id
         WHERE q.token_hash = ?`
      )
      .bind(customerId, tokenHash)
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
  const token = normalizeToken(rawToken);
  if (!isValidTokenFormat(token)) {
    return { ok: false, code: "QR_INVALID" };
  }

  const tokenHash = await hashQrToken(token);
  const customer = await getOrCreateCustomer(db, request, options);
  const availableReward = await lookupAvailableReward(db, customer.customerId);

  if (availableReward) {
    return {
      ok: false,
      code: "REWARD_REQUIRES_SELLER",
      customerCookie: customer.cookie,
      reward: publicReward(availableReward)
    };
  }

  let purchaseTransaction;

  try {
    purchaseTransaction = await createPurchaseAndConsumeQr(db, tokenHash, customer.customerId);
  } catch {
    return {
      ok: false,
      code: "PURCHASE_CONFLICT",
      customerCookie: customer.cookie
    };
  }

  if (!purchaseTransaction) {
    const currentReward = await lookupAvailableReward(db, customer.customerId);

    if (currentReward) {
      return {
        ok: false,
        code: "REWARD_REQUIRES_SELLER",
        customerCookie: customer.cookie,
        reward: publicReward(currentReward)
      };
    }

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

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS purchase_count
       FROM purchases
       WHERE customer_id = ?`
    )
    .bind(customer.customerId)
    .first();
  const progress = calculateProgress(countRow?.purchase_count ?? 0);
  const currentReward = unlockedReward ?? await lookupAvailableReward(db, customer.customerId);

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
