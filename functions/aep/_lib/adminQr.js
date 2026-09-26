import { generateQrToken, hashQrToken } from "./crypto.js";
import { renderQrSvg } from "./qrSvg.js";

export async function listQrCodes(db, { query = "", status = "", productId = null, page = 1, limit = 50 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  if (query.trim()) {
    const num = Number.parseInt(query.trim(), 10);
    if (!Number.isNaN(num)) {
      conditions.push("q.public_number = ?");
      params.push(num);
    }
  }

  if (status.trim() && ["available", "used", "disabled"].includes(status.trim())) {
    conditions.push("q.status = ?");
    params.push(status.trim());
  }

  if (productId) {
    const pId = Number.parseInt(productId, 10);
    if (Number.isInteger(pId) && pId > 0) {
      conditions.push("q.product_id = ?");
      params.push(pId);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM qr_codes q ${whereClause}`)
    .bind(...params)
    .first();

  const total = countRow?.total ?? 0;

  const querySql = `
    SELECT 
      q.id,
      q.public_number,
      q.product_id,
      p.name as product_name,
      p.price_cents as product_price_cents,
      q.status,
      q.created_at,
      q.used_at
    FROM qr_codes q
    LEFT JOIN products p ON p.id = q.product_id
    ${whereClause}
    ORDER BY q.public_number ASC
    LIMIT ? OFFSET ?
  `;

  const rows = await db
    .prepare(querySql)
    .bind(...params, safeLimit, offset)
    .all();

  const items = (rows?.results ?? []).map((q) => ({
    id: q.id,
    publicNumber: q.public_number,
    productId: q.product_id,
    productName: q.product_name ?? "Sin producto",
    productPriceCents: q.product_price_cents ?? 0,
    status: q.status,
    createdAt: q.created_at,
    usedAt: q.used_at
  }));

  return {
    items,
    pagination: {
      page: safePage,
      pageSize: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
}

export async function getQrByPublicNumber(db, publicNumber) {
  const num = Number.parseInt(publicNumber, 10);
  if (!Number.isInteger(num) || num < 1) return null;

  const row = await db
    .prepare(
      `SELECT 
        q.id,
        q.public_number,
        q.product_id,
        p.name as product_name,
        p.price_cents as product_price_cents,
        q.status,
        q.created_at,
        q.used_at,
        pur.id as purchase_id,
        pur.customer_id,
        pur.created_at as purchase_created_at
       FROM qr_codes q
       LEFT JOIN products p ON p.id = q.product_id
       LEFT JOIN purchases pur ON pur.qr_code_id = q.id
       WHERE q.public_number = ?`
    )
    .bind(num)
    .first();

  if (!row) return null;

  return {
    id: row.id,
    publicNumber: row.public_number,
    productId: row.product_id,
    productName: row.product_name ?? "Sin producto",
    productPriceCents: row.product_price_cents ?? 0,
    status: row.status,
    createdAt: row.created_at,
    usedAt: row.used_at,
    purchase: row.purchase_id
      ? {
          id: row.purchase_id,
          customerId: row.customer_id,
          createdAt: row.purchase_created_at
        }
      : null
  };
}

export async function generateQrBatch(
  db,
  { productId, count, startNumber = null, tokenLength = 12, baseUrl = "https://gammsgroup.pages.dev" }
) {
  const pId = Number.parseInt(productId, 10);
  if (!Number.isInteger(pId) || pId < 1) {
    return { ok: false, code: "INVALID_PRODUCT_ID" };
  }

  const batchCount = Number.parseInt(count, 10);
  if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 500) {
    return { ok: false, code: "INVALID_BATCH_COUNT", message: "Count must be between 1 and 500." };
  }

  // Verify product exists and is active
  const product = await db
    .prepare("SELECT id, name, price_cents, active FROM products WHERE id = ?")
    .bind(pId)
    .first();

  if (!product) {
    return { ok: false, code: "PRODUCT_NOT_FOUND" };
  }

  // Determine starting public number if not provided
  let currentStart = Number.parseInt(startNumber, 10);
  if (!Number.isInteger(currentStart) || currentStart < 1) {
    const maxRow = await db.prepare("SELECT MAX(public_number) as max_num FROM qr_codes").first();
    currentStart = (maxRow?.max_num ?? 0) + 1;
  }

  const cleanBaseUrl = String(baseUrl ?? "https://gammsgroup.pages.dev").replace(/\/+$/, "");

  const batchItems = [];
  const dbStatements = [];

  for (let i = 0; i < batchCount; i += 1) {
    const publicNumber = currentStart + i;
    const token = generateQrToken(tokenLength);
    const tokenHash = await hashQrToken(token);
    const promoUrl = `${cleanBaseUrl}/aep/promo/r/${token}`;
    const svg = renderQrSvg(promoUrl);

    dbStatements.push(
      db
        .prepare(
          `INSERT INTO qr_codes (public_number, token_hash, product_id, status, created_at)
           VALUES (?, ?, ?, 'available', CURRENT_TIMESTAMP)`
        )
        .bind(publicNumber, tokenHash, pId)
    );

    batchItems.push({
      publicNumber,
      token, // Returned ONLY once in this creation response
      tokenHash,
      url: promoUrl,
      svg,
      product: {
        id: product.id,
        name: product.name,
        priceCents: product.price_cents
      }
    });
  }

  try {
    await db.batch(dbStatements);

    return {
      ok: true,
      count: batchCount,
      startNumber: currentStart,
      endNumber: currentStart + batchCount - 1,
      items: batchItems
    };
  } catch (error) {
    if (error?.message?.includes("UNIQUE constraint failed: qr_codes.public_number")) {
      return {
        ok: false,
        code: "PUBLIC_NUMBER_CONFLICT",
        message: "One or more public numbers already exist. Try a higher start number."
      };
    }
    return { ok: false, code: "DATABASE_ERROR", message: error.message };
  }
}

export async function disableQr(db, publicNumber) {
  const qr = await getQrByPublicNumber(db, publicNumber);
  if (!qr) {
    return { ok: false, code: "QR_NOT_FOUND" };
  }

  if (qr.status === "used") {
    return { ok: false, code: "QR_ALREADY_USED", message: "Used QR codes cannot be disabled." };
  }

  if (qr.status === "disabled") {
    return { ok: true, qr };
  }

  await db
    .prepare("UPDATE qr_codes SET status = 'disabled' WHERE public_number = ?")
    .bind(qr.publicNumber)
    .run();

  const updated = await getQrByPublicNumber(db, qr.publicNumber);
  return { ok: true, qr: updated };
}

export async function reactivateQr(db, publicNumber) {
  const qr = await getQrByPublicNumber(db, publicNumber);
  if (!qr) {
    return { ok: false, code: "QR_NOT_FOUND" };
  }

  if (qr.status === "used" || qr.usedAt !== null) {
    return { ok: false, code: "QR_ALREADY_USED", message: "Used QR codes can NEVER be reactivated." };
  }

  if (qr.status === "available") {
    return { ok: true, qr };
  }

  await db
    .prepare("UPDATE qr_codes SET status = 'available' WHERE public_number = ? AND used_at IS NULL")
    .bind(qr.publicNumber)
    .run();

  const updated = await getQrByPublicNumber(db, qr.publicNumber);
  return { ok: true, qr: updated };
}
