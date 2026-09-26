import { formatFriendlyCustomerId } from "./sales.js";

export async function getDashboardStats(db) {
  if (!db) return null;

  // 1. Total revenue & today's revenue
  const revenueRow = await db
    .prepare(
      `SELECT 
        COALESCE(SUM(final_price_cents), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN DATE(created_at) = DATE('now') THEN final_price_cents ELSE 0 END), 0) as today_revenue,
        COUNT(*) as total_sales,
        COALESCE(SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END), 0) as today_sales
       FROM purchases`
    )
    .first();

  // 2. QR codes stats
  const qrRow = await db
    .prepare(
      `SELECT 
        COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) as available_qr,
        COALESCE(SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END), 0) as used_qr,
        COUNT(*) as total_qr
       FROM qr_codes`
    )
    .first();

  // 3. Rewards stats
  const rewardRow = await db
    .prepare(
      `SELECT 
        COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) as available_rewards,
        COALESCE(SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END), 0) as redeemed_rewards,
        COUNT(*) as total_rewards
       FROM rewards`
    )
    .first();

  // 4. Claims stats
  let activeClaimsCount = 0;
  try {
    const claimRow = await db
      .prepare(
        `SELECT COUNT(*) as active_claims FROM reward_claims WHERE status = 'available' AND expires_at > CURRENT_TIMESTAMP`
      )
      .first();
    activeClaimsCount = claimRow?.active_claims ?? 0;
  } catch {
    activeClaimsCount = 0;
  }

  // 5. Products & Low Stock stats
  const productRow = await db
    .prepare(
      `SELECT 
        COUNT(*) as total_products,
        COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) as active_products,
        COALESCE(SUM(CASE WHEN active = 1 AND COALESCE(stock_quantity, 0) <= COALESCE(low_stock_threshold, 5) THEN 1 ELSE 0 END), 0) as low_stock_count
       FROM products`
    )
    .first();

  // 6. Recent 5 Sales
  const recentSalesRows = await db
    .prepare(
      `SELECT 
        pur.id,
        pur.customer_id,
        p.name as product_name,
        q.public_number as qr_number,
        pur.final_price_cents,
        pur.discount_percent,
        pur.created_at
       FROM purchases pur
       JOIN products p ON p.id = pur.product_id
       JOIN qr_codes q ON q.id = pur.qr_code_id
       ORDER BY pur.id DESC
       LIMIT 5`
    )
    .all();

  const recentSales = (recentSalesRows?.results ?? []).map((row) => ({
    id: row.id,
    customerLabel: formatFriendlyCustomerId(row.customer_id),
    productName: row.product_name,
    qrNumber: row.qr_number,
    finalPriceCents: row.final_price_cents,
    discountPercent: row.discount_percent,
    createdAt: row.created_at
  }));

  // 7. Top 5 Best Selling Products
  const topProductsRows = await db
    .prepare(
      `SELECT 
        p.id,
        p.name,
        COUNT(pur.id) as sales_count,
        COALESCE(SUM(pur.final_price_cents), 0) as revenue_cents
       FROM products p
       LEFT JOIN purchases pur ON pur.product_id = p.id
       WHERE p.active = 1
       GROUP BY p.id
       ORDER BY sales_count DESC, revenue_cents DESC
       LIMIT 5`
    )
    .all();

  const topProducts = (topProductsRows?.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    salesCount: row.sales_count ?? 0,
    revenueCents: row.revenue_cents ?? 0
  }));

  // 8. Low Stock Warnings
  const lowStockRows = await db
    .prepare(
      `SELECT id, name, stock_quantity, low_stock_threshold
       FROM products
       WHERE active = 1 AND COALESCE(stock_quantity, 0) <= COALESCE(low_stock_threshold, 5)
       ORDER BY stock_quantity ASC
       LIMIT 5`
    )
    .all();

  const lowStockProducts = (lowStockRows?.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    stockQuantity: row.stock_quantity ?? 0,
    lowStockThreshold: row.low_stock_threshold ?? 5
  }));

  return {
    overview: {
      totalRevenueCents: revenueRow?.total_revenue ?? 0,
      todayRevenueCents: revenueRow?.today_revenue ?? 0,
      totalSalesCount: revenueRow?.total_sales ?? 0,
      todaySalesCount: revenueRow?.today_sales ?? 0,

      availableQrCount: qrRow?.available_qr ?? 0,
      usedQrCount: qrRow?.used_qr ?? 0,
      totalQrCount: qrRow?.total_qr ?? 0,

      availableRewardsCount: rewardRow?.available_rewards ?? 0,
      redeemedRewardsCount: rewardRow?.redeemed_rewards ?? 0,
      totalRewardsCount: rewardRow?.total_rewards ?? 0,

      activeClaimsCount,

      totalProductsCount: productRow?.total_products ?? 0,
      activeProductsCount: productRow?.active_products ?? 0,
      lowStockProductsCount: productRow?.low_stock_count ?? 0
    },
    recentSales,
    topProducts,
    lowStockProducts
  };
}
