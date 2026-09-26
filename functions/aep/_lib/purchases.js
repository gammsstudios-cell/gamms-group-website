import { hashQrToken, isValidTokenFormat, normalizeToken } from "./crypto.js";
import {
  buildCustomerCookie,
  generateCustomerId as defaultGenerateCustomerId,
  getCustomerIdFromRequest
} from "./cookies.js";
import { calculateProgress } from "./progress.js";

const EXPECTED_PURCHASE_ERRORS = new Set([
  "QR_INVALID",
  "QR_ALREADY_USED",
  "QR_DISABLED",
  "PRODUCT_NOT_FOUND",
  "PURCHASE_CONFLICT"
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

  return "QR_INVALID";
}

function getFirstBatchRow(result) {
  return Array.isArray(result?.results) ? result.results[0] : null;
}

function getBatchChanges(result) {
  return Number(result?.meta?.changes ?? 0);
}

async function createPurchaseAndConsumeQr(db, tokenHash, customerId) {
  const [insertResult, updateResult] = await db.batch([
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
           AND q.status = 'available'`
      )
      .bind(customerId, tokenHash),
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
      .bind(tokenHash)
  ]);

  const consumedQr = getFirstBatchRow(updateResult);

  if (getBatchChanges(insertResult) !== 1 || !consumedQr) {
    return null;
  }

  return consumedQr;
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
  let consumedQr;

  try {
    consumedQr = await createPurchaseAndConsumeQr(db, tokenHash, customer.customerId);
  } catch {
    return {
      ok: false,
      code: "PURCHASE_CONFLICT",
      customerCookie: customer.cookie
    };
  }

  if (!consumedQr) {
    return {
      ok: false,
      code: await classifyQrFailure(db, tokenHash),
      customerCookie: customer.cookie
    };
  }

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
    progress
  };
}

export function sanitizePurchaseError(error) {
  return EXPECTED_PURCHASE_ERRORS.has(error) ? error : "INTERNAL_ERROR";
}
