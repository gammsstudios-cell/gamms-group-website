export async function listProducts(db, { query = "", category = "", active = null, page = 1, limit = 50 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  if (query.trim()) {
    conditions.push("(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)");
    const search = `%${query.trim()}%`;
    params.push(search, search, search);
  }

  if (category.trim()) {
    conditions.push("p.category = ?");
    params.push(category.trim());
  }

  if (active !== null && active !== undefined && active !== "") {
    conditions.push("p.active = ?");
    params.push(Number(active) ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM products p ${whereClause}`)
    .bind(...params)
    .first();

  const total = countRow?.total ?? 0;

  // Compute total sales and total revenue per product
  const querySql = `
    SELECT 
      p.id,
      p.name,
      COALESCE(p.description, '') as description,
      COALESCE(p.category, 'bebidas') as category,
      COALESCE(p.sku, '') as sku,
      p.price_cents,
      p.cost_cents,
      p.active,
      COALESCE(p.stock_quantity, 0) as stock_quantity,
      COALESCE(p.low_stock_threshold, 5) as low_stock_threshold,
      p.image_url,
      p.created_at,
      COALESCE(p.updated_at, p.created_at) as updated_at,
      COUNT(pur.id) as sales_count,
      COALESCE(SUM(pur.final_price_cents), 0) as revenue_cents,
      (SELECT COUNT(*) FROM qr_codes q WHERE q.product_id = p.id AND q.status = 'available') as available_qr_count,
      (SELECT COUNT(*) FROM qr_codes q WHERE q.product_id = p.id) as total_qr_count
    FROM products p
    LEFT JOIN purchases pur ON pur.product_id = p.id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.active DESC, p.name ASC
    LIMIT ? OFFSET ?
  `;

  const rows = await db
    .prepare(querySql)
    .bind(...params, safeLimit, offset)
    .all();

  const items = (rows?.results ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    sku: p.sku,
    priceCents: p.price_cents,
    costCents: p.cost_cents,
    active: Boolean(p.active),
    stockQuantity: p.stock_quantity,
    lowStockThreshold: p.low_stock_threshold,
    imageUrl: p.image_url,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    salesCount: p.sales_count,
    revenueCents: p.revenue_cents,
    availableQrCount: p.available_qr_count,
    totalQrCount: p.total_qr_count,
    isLowStock: p.stock_quantity <= p.low_stock_threshold
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

export async function getProductById(db, id) {
  const productId = Number.parseInt(id, 10);
  if (!Number.isInteger(productId) || productId < 1) return null;

  const p = await db
    .prepare(
      `SELECT 
        p.*,
        COUNT(pur.id) as sales_count,
        COALESCE(SUM(pur.final_price_cents), 0) as revenue_cents,
        (SELECT COUNT(*) FROM qr_codes q WHERE q.product_id = p.id AND q.status = 'available') as available_qr_count,
        (SELECT COUNT(*) FROM qr_codes q WHERE q.product_id = p.id) as total_qr_count
       FROM products p
       LEFT JOIN purchases pur ON pur.product_id = p.id
       WHERE p.id = ?
       GROUP BY p.id`
    )
    .bind(productId)
    .first();

  if (!p) return null;

  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    category: p.category ?? "bebidas",
    sku: p.sku ?? "",
    priceCents: p.price_cents,
    costCents: p.cost_cents ?? null,
    active: Boolean(p.active),
    stockQuantity: p.stock_quantity ?? 0,
    lowStockThreshold: p.low_stock_threshold ?? 5,
    imageUrl: p.image_url ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at ?? p.created_at,
    salesCount: p.sales_count ?? 0,
    revenueCents: p.revenue_cents ?? 0,
    availableQrCount: p.available_qr_count ?? 0,
    totalQrCount: p.total_qr_count ?? 0,
    isLowStock: (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5)
  };
}

export async function createProduct(db, data) {
  const name = String(data.name ?? "").trim();
  const priceCents = Number.parseInt(data.priceCents, 10);

  if (!name || name.length < 2) {
    return { ok: false, code: "INVALID_NAME", message: "Name must be at least 2 characters." };
  }

  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return { ok: false, code: "INVALID_PRICE", message: "Price in cents must be a non-negative integer." };
  }

  const description = data.description ? String(data.description).trim() : null;
  const category = data.category ? String(data.category).trim() : "bebidas";
  const sku = data.sku ? String(data.sku).trim() : null;
  const costCents = data.costCents !== undefined && data.costCents !== null && data.costCents !== ""
    ? Number.parseInt(data.costCents, 10)
    : null;
  const stockQuantity = Math.max(0, Number.parseInt(data.stockQuantity, 10) || 0);
  const lowStockThreshold = Math.max(0, Number.parseInt(data.lowStockThreshold, 10) || 5);
  const active = data.active === undefined || data.active === true || data.active === 1 ? 1 : 0;
  const imageUrl = data.imageUrl ? String(data.imageUrl).trim() : null;

  try {
    const result = await db
      .prepare(
        `INSERT INTO products (name, description, category, sku, price_cents, cost_cents, active, stock_quantity, low_stock_threshold, image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`
      )
      .bind(name, description, category, sku, priceCents, costCents, active, stockQuantity, lowStockThreshold, imageUrl)
      .first();

    const productId = result?.id;
    if (!productId) {
      return { ok: false, code: "PRODUCT_CREATE_FAILED" };
    }

    // Insert initial inventory movement if stock > 0
    if (stockQuantity > 0) {
      await db
        .prepare(
          `INSERT INTO inventory_movements (product_id, movement_type, quantity_delta, reason, actor_type, actor_identifier, created_at)
           VALUES (?, 'initial', ?, 'Initial product creation stock', 'admin', 'admin', CURRENT_TIMESTAMP)`
        )
        .bind(productId, stockQuantity)
        .run()
        .catch(() => {});
    }

    const product = await getProductById(db, productId);
    return { ok: true, product };
  } catch (error) {
    return { ok: false, code: "DATABASE_ERROR", message: error.message };
  }
}

export async function updateProduct(db, id, data) {
  const existing = await getProductById(db, id);
  if (!existing) {
    return { ok: false, code: "PRODUCT_NOT_FOUND" };
  }

  const name = data.name !== undefined ? String(data.name).trim() : existing.name;
  if (!name || name.length < 2) {
    return { ok: false, code: "INVALID_NAME" };
  }

  const priceCents = data.priceCents !== undefined ? Number.parseInt(data.priceCents, 10) : existing.priceCents;
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return { ok: false, code: "INVALID_PRICE" };
  }

  const description = data.description !== undefined ? (data.description ? String(data.description).trim() : null) : existing.description;
  const category = data.category !== undefined ? String(data.category).trim() : existing.category;
  const sku = data.sku !== undefined ? (data.sku ? String(data.sku).trim() : null) : existing.sku;
  const costCents = data.costCents !== undefined
    ? (data.costCents !== null && data.costCents !== "" ? Number.parseInt(data.costCents, 10) : null)
    : existing.costCents;
  const lowStockThreshold = data.lowStockThreshold !== undefined ? Math.max(0, Number.parseInt(data.lowStockThreshold, 10) || 0) : existing.lowStockThreshold;
  const active = data.active !== undefined ? (data.active ? 1 : 0) : (existing.active ? 1 : 0);
  const imageUrl = data.imageUrl !== undefined ? (data.imageUrl ? String(data.imageUrl).trim() : null) : existing.imageUrl;

  await db
    .prepare(
      `UPDATE products 
       SET name = ?, description = ?, category = ?, sku = ?, price_cents = ?, cost_cents = ?, active = ?, low_stock_threshold = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(name, description, category, sku, priceCents, costCents, active, lowStockThreshold, imageUrl, existing.id)
    .run();

  const updated = await getProductById(db, existing.id);
  return { ok: true, product: updated };
}
