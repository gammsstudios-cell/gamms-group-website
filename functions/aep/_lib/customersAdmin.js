import { formatFriendlyCustomerId } from "./sales.js";

export async function listCustomers(db, { query = "", page = 1, limit = 50 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  if (query.trim()) {
    conditions.push("c.id LIKE ?");
    params.push(`%${query.trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM customers c ${whereClause}`)
    .bind(...params)
    .first();

  const total = countRow?.total ?? 0;

  const querySql = `
    SELECT 
      c.id,
      c.created_at,
      c.last_seen_at,
      COUNT(DISTINCT pur.id) as purchase_count,
      COALESCE(SUM(pur.final_price_cents), 0) as total_spent_cents,
      (SELECT COUNT(*) FROM rewards r WHERE r.customer_id = c.id) as rewards_earned,
      (SELECT COUNT(*) FROM rewards r WHERE r.customer_id = c.id AND r.status = 'redeemed') as rewards_redeemed
    FROM customers c
    LEFT JOIN purchases pur ON pur.customer_id = c.id
    ${whereClause}
    GROUP BY c.id
    ORDER BY c.last_seen_at DESC, c.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db
    .prepare(querySql)
    .bind(...params, safeLimit, offset)
    .all();

  const items = (rows?.results ?? []).map((row) => {
    const purchaseCount = row.purchase_count ?? 0;
    return {
      idMasked: formatFriendlyCustomerId(row.id),
      purchaseCount,
      cyclePosition: (purchaseCount % 3) || (purchaseCount > 0 ? 3 : 0),
      rewardsEarned: row.rewards_earned ?? 0,
      rewardsRedeemed: row.rewards_redeemed ?? 0,
      totalSpentCents: row.total_spent_cents ?? 0,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at ?? row.created_at
    };
  });

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
