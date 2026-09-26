import { getSettings } from "./settings.js";

export const ALLOWED_MOVEMENT_TYPES = ["initial", "restock", "sale", "adjustment", "return", "correction"];

export async function recordInventoryMovement(
  db,
  {
    productId,
    quantityDelta,
    movementType,
    reason,
    purchaseId = null,
    adminNote = null,
    actorType = "admin",
    actorIdentifier = "admin"
  }
) {
  const pId = Number.parseInt(productId, 10);
  const delta = Number.parseInt(quantityDelta, 10);

  if (!Number.isInteger(pId) || pId < 1) {
    return { ok: false, code: "INVALID_PRODUCT_ID" };
  }

  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false, code: "INVALID_QUANTITY_DELTA" };
  }

  if (!ALLOWED_MOVEMENT_TYPES.includes(movementType)) {
    return { ok: false, code: "INVALID_MOVEMENT_TYPE" };
  }

  const reasonText = String(reason ?? "").trim();
  if (!reasonText) {
    return { ok: false, code: "REASON_REQUIRED" };
  }

  // Check product current stock
  const product = await db
    .prepare("SELECT id, name, COALESCE(stock_quantity, 0) as stock_quantity FROM products WHERE id = ?")
    .bind(pId)
    .first();

  if (!product) {
    return { ok: false, code: "PRODUCT_NOT_FOUND" };
  }

  const currentStock = product.stock_quantity ?? 0;
  const newStock = currentStock + delta;

  // Check negative stock setting
  const settings = await getSettings(db);
  const allowNegative = settings.allow_negative_stock === "true";

  if (newStock < 0 && !allowNegative) {
    return {
      ok: false,
      code: "INSUFFICIENT_STOCK",
      message: `Stock cannot drop below 0 (current: ${currentStock}, requested change: ${delta}).`
    };
  }

  try {
    const insertStmt = db
      .prepare(
        `INSERT INTO inventory_movements 
          (product_id, movement_type, quantity_delta, reason, purchase_id, admin_note, actor_type, actor_identifier, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(pId, movementType, delta, reasonText, purchaseId, adminNote, actorType, actorIdentifier);

    const updateStmt = db
      .prepare(
        `UPDATE products
         SET stock_quantity = COALESCE(stock_quantity, 0) + ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(delta, pId);

    await db.batch([insertStmt, updateStmt]);

    return {
      ok: true,
      movement: {
        productId: pId,
        productName: product.name,
        previousStock: currentStock,
        newStock,
        quantityDelta: delta,
        movementType,
        reason: reasonText
      }
    };
  } catch (error) {
    return { ok: false, code: "DATABASE_ERROR", message: error.message };
  }
}

export async function listInventoryMovements(db, { productId = null, page = 1, limit = 50 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  if (productId) {
    const pId = Number.parseInt(productId, 10);
    if (Number.isInteger(pId) && pId > 0) {
      conditions.push("m.product_id = ?");
      params.push(pId);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM inventory_movements m ${whereClause}`)
    .bind(...params)
    .first();

  const total = countRow?.total ?? 0;

  const querySql = `
    SELECT 
      m.id,
      m.product_id,
      p.name as product_name,
      m.movement_type,
      m.quantity_delta,
      m.reason,
      m.purchase_id,
      m.admin_note,
      m.actor_type,
      m.actor_identifier,
      m.created_at
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    ${whereClause}
    ORDER BY m.id DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db
    .prepare(querySql)
    .bind(...params, safeLimit, offset)
    .all();

  const items = (rows?.results ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    movementType: row.movement_type,
    quantityDelta: row.quantity_delta,
    reason: row.reason,
    purchaseId: row.purchase_id,
    adminNote: row.admin_note,
    actorType: row.actor_type,
    actorIdentifier: row.actor_identifier,
    createdAt: row.created_at
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
