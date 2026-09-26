import { csvEscape } from "./adminResponses.js";

export function formatFriendlyCustomerId(uuid) {
  if (!uuid) return "Cliente Anónimo";
  const str = String(uuid).replace(/^cust_/, "");
  const suffix = str.slice(0, 4).toUpperCase();
  return `Cliente ${suffix}`;
}

export async function listSales(
  db,
  {
    query = "",
    productId = null,
    discountOnly = false,
    date = "",
    period = "all",
    page = 1,
    limit = 50
  } = {}
) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  if (query.trim()) {
    const num = Number.parseInt(query.trim(), 10);
    if (!Number.isNaN(num)) {
      conditions.push("(q.public_number = ? OR pur.id = ?)");
      params.push(num, num);
    } else {
      conditions.push("(p.name LIKE ? OR pur.customer_id LIKE ?)");
      const search = `%${query.trim()}%`;
      params.push(search, search);
    }
  }

  if (productId) {
    const pId = Number.parseInt(productId, 10);
    if (Number.isInteger(pId) && pId > 0) {
      conditions.push("pur.product_id = ?");
      params.push(pId);
    }
  }

  if (discountOnly) {
    conditions.push("pur.discount_percent > 0");
  }

  if (date.trim()) {
    conditions.push("DATE(pur.created_at) = DATE(?)");
    params.push(date.trim());
  } else if (period === "today") {
    conditions.push("DATE(pur.created_at) = DATE('now')");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Summary aggregate query
  const summaryRow = await db
    .prepare(
      `SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(pur.final_price_cents), 0) as total_revenue_cents,
        COALESCE(SUM(pur.regular_price_cents - pur.final_price_cents), 0) as total_discounts_cents,
        COALESCE(AVG(pur.final_price_cents), 0) as avg_price_cents
       FROM purchases pur
       JOIN products p ON p.id = pur.product_id
       JOIN qr_codes q ON q.id = pur.qr_code_id
       ${whereClause}`
    )
    .bind(...params)
    .first();

  const total = summaryRow?.total_sales ?? 0;
  const totalRevenueCents = summaryRow?.total_revenue_cents ?? 0;
  const totalDiscountsCents = summaryRow?.total_discounts_cents ?? 0;
  const avgPriceCents = Math.round(summaryRow?.avg_price_cents ?? 0);

  const querySql = `
    SELECT 
      pur.id,
      pur.customer_id,
      pur.product_id,
      p.name as product_name,
      q.public_number as qr_public_number,
      pur.regular_price_cents,
      pur.discount_percent,
      pur.final_price_cents,
      pur.created_at,
      r.cycle_number as reward_cycle_number,
      r.reward_type
    FROM purchases pur
    JOIN products p ON p.id = pur.product_id
    JOIN qr_codes q ON q.id = pur.qr_code_id
    LEFT JOIN rewards r ON r.redeemed_purchase_id = pur.id
    ${whereClause}
    ORDER BY pur.id DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db
    .prepare(querySql)
    .bind(...params, safeLimit, offset)
    .all();

  const items = (rows?.results ?? []).map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    customerLabel: formatFriendlyCustomerId(row.customer_id),
    productId: row.product_id,
    productName: row.product_name,
    qrPublicNumber: row.qr_public_number,
    regularPriceCents: row.regular_price_cents,
    discountPercent: row.discount_percent,
    finalPriceCents: row.final_price_cents,
    discountAmountCents: row.regular_price_cents - row.final_price_cents,
    createdAt: row.created_at,
    rewardCycleNumber: row.reward_cycle_number ?? null,
    isDiscounted: row.discount_percent > 0
  }));

  return {
    items,
    summary: {
      totalSalesCount: total,
      totalRevenueCents,
      totalDiscountsCents,
      avgPriceCents
    },
    pagination: {
      page: safePage,
      pageSize: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
}

export function buildSalesCsv(salesItems) {
  const headers = ["ID Venta", "Fecha/Hora", "Producto", "QR #", "Precio Regular (C$)", "Descuento (%)", "Precio Final (C$)", "Cliente"];
  const rows = salesItems.map((item) => [
    item.id,
    item.createdAt,
    item.productName,
    item.qrPublicNumber,
    (item.regularPriceCents / 100).toFixed(2),
    item.discountPercent,
    (item.finalPriceCents / 100).toFixed(2),
    item.customerLabel
  ]);

  const csvLines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    csvLines.push(row.map(csvEscape).join(","));
  }

  return csvLines.join("\n");
}
