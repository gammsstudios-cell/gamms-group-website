// GAMMS AEP Event Reports and Closing Summary Library
import { csvEscape } from "./adminResponses.js";

/**
 * Computes full executive event performance report.
 * Excludes voided purchases from financial totals.
 */
export async function getEventReport(db) {
  // Total non-voided sales
  const salesSummary = await db.prepare(`
    SELECT 
      COUNT(p.id) as total_units,
      COALESCE(SUM(p.final_price_cents), 0) as total_revenue_cents,
      COALESCE(SUM(p.regular_price_cents - p.final_price_cents), 0) as total_discount_cents,
      SUM(CASE WHEN p.discount_percent = 0 THEN 1 ELSE 0 END) as normal_sales_count,
      COALESCE(SUM(CASE WHEN p.discount_percent = 0 THEN p.final_price_cents ELSE 0 END), 0) as normal_revenue_cents,
      SUM(CASE WHEN p.discount_percent > 0 THEN 1 ELSE 0 END) as reward_sales_count,
      COALESCE(SUM(CASE WHEN p.discount_percent > 0 THEN p.final_price_cents ELSE 0 END), 0) as reward_revenue_cents
    FROM purchases p
    LEFT JOIN purchase_voids pv ON p.id = pv.purchase_id
    WHERE pv.purchase_id IS NULL
  `).first();

  // Inventory stats
  const inventoryStats = await db.prepare(`
    SELECT 
      COUNT(*) as product_types_count,
      COALESCE(SUM(stock_quantity), 0) as remaining_stock_quantity
    FROM products
  `).first();

  // Reward stats
  const rewardStats = await db.prepare(`
    SELECT 
      COUNT(*) as total_rewards_generated,
      SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) as rewards_redeemed,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as rewards_available,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as rewards_expired,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as rewards_cancelled
    FROM rewards
  `).first();

  // Customer stats
  const customerStats = await db.prepare(`
    SELECT COUNT(DISTINCT customer_id) as unique_customers
    FROM purchases p
    LEFT JOIN purchase_voids pv ON p.id = pv.purchase_id
    WHERE pv.purchase_id IS NULL
  `).first();

  // Top products sold
  const topProducts = await db.prepare(`
    SELECT 
      pr.name, pr.price_cents,
      COUNT(p.id) as units_sold,
      COALESCE(SUM(p.final_price_cents), 0) as revenue_cents
    FROM purchases p
    JOIN products pr ON p.product_id = pr.id
    LEFT JOIN purchase_voids pv ON p.id = pv.purchase_id
    WHERE pv.purchase_id IS NULL
    GROUP BY pr.id
    ORDER BY units_sold DESC
  `).all();

  // Sales per staff seller
  const salesBySeller = await db.prepare(`
    SELECT 
      COALESCE(u.display_name, 'Cliente Self-Scan') as seller_name,
      COUNT(p.id) as units_sold,
      COALESCE(SUM(p.final_price_cents), 0) as revenue_cents,
      SUM(CASE WHEN p.discount_percent > 0 THEN 1 ELSE 0 END) as reward_sales_count
    FROM purchases p
    LEFT JOIN purchase_voids pv ON p.id = pv.purchase_id
    LEFT JOIN purchase_attribution pa ON p.id = pa.purchase_id
    LEFT JOIN aep_users u ON pa.staff_user_id = u.id
    WHERE pv.purchase_id IS NULL
    GROUP BY pa.staff_user_id
    ORDER BY units_sold DESC
  `).all();

  // Peak hour
  const peakHour = await db.prepare(`
    SELECT 
      strftime('%H:00', p.created_at) as hour_slot,
      COUNT(p.id) as sales_count
    FROM purchases p
    LEFT JOIN purchase_voids pv ON p.id = pv.purchase_id
    WHERE pv.purchase_id IS NULL
    GROUP BY hour_slot
    ORDER BY sales_count DESC
    LIMIT 1
  `).first();

  return {
    totalUnits: Number(salesSummary?.total_units || 0),
    totalRevenueCents: Number(salesSummary?.total_revenue_cents || 0),
    totalDiscountCents: Number(salesSummary?.total_discount_cents || 0),
    normalSalesCount: Number(salesSummary?.normal_sales_count || 0),
    normalRevenueCents: Number(salesSummary?.normal_revenue_cents || 0),
    rewardSalesCount: Number(salesSummary?.reward_sales_count || 0),
    rewardRevenueCents: Number(salesSummary?.reward_revenue_cents || 0),
    remainingStockQuantity: Number(inventoryStats?.remaining_stock_quantity || 0),
    totalRewardsGenerated: Number(rewardStats?.total_rewards_generated || 0),
    rewardsRedeemed: Number(rewardStats?.rewards_redeemed || 0),
    rewardsAvailable: Number(rewardStats?.rewards_available || 0),
    rewardsExpired: Number(rewardStats?.rewards_expired || 0),
    uniqueCustomersCount: Number(customerStats?.unique_customers || 0),
    topProducts: topProducts?.results || [],
    salesBySeller: salesBySeller?.results || [],
    peakHour: peakHour?.hour_slot || "N/A"
  };
}

/**
 * Exports event performance report as formatted CSV.
 */
export async function exportEventReportCsv(db) {
  const report = await getEventReport(db);

  let csv = "GAMMS AEP - REPORT DE CIERRE DEL EVENTO\n";
  csv += "By GAMMS GROUP\n\n";
  csv += `Fecha de Generacion,${csvEscape(new Date().toISOString())}\n`;
  csv += `Unidades Vendidas Total,${report.totalUnits}\n`;
  csv += `Ingreso Total (NIO),${(report.totalRevenueCents / 100).toFixed(2)}\n`;
  csv += `Descuentos Otorgados (NIO),${(report.totalDiscountCents / 100).toFixed(2)}\n`;
  csv += `Ventas Normales,${report.normalSalesCount}\n`;
  csv += `Ventas con 50% OFF,${report.rewardSalesCount}\n`;
  csv += `Clientes Unicos,${report.uniqueCustomersCount}\n`;
  csv += `Premios Generados,${report.totalRewardsGenerated}\n`;
  csv += `Premios Canjeados,${report.rewardsRedeemed}\n`;
  csv += `Hora Pico,${csvEscape(report.peakHour)}\n\n`;

  csv += "RENDIMIENTO POR VENDEDOR\n";
  csv += "Vendedor,Unidades,Ingreso (NIO),Ventas 50%\n";
  for (const s of report.salesBySeller) {
    csv += `${csvEscape(s.seller_name)},${s.units_sold},${(s.revenue_cents / 100).toFixed(2)},${s.reward_sales_count}\n`;
  }

  csv += "\nPRODUCTOS MAS VENDIDOS\n";
  csv += "Producto,Unidades,Ingreso (NIO)\n";
  for (const p of report.topProducts) {
    csv += `${csvEscape(p.name)},${p.units_sold},${(p.revenue_cents / 100).toFixed(2)}\n`;
  }

  return csv;
}
