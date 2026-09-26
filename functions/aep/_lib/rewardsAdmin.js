import { formatFriendlyCustomerId } from "./sales.js";

export async function listRewards(db, { status = "", customerId = "", page = 1, limit = 50 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  if (status.trim() && ["available", "redeemed", "expired", "cancelled"].includes(status.trim())) {
    conditions.push("r.status = ?");
    params.push(status.trim());
  }

  if (customerId.trim()) {
    conditions.push("r.customer_id LIKE ?");
    params.push(`%${customerId.trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM rewards r ${whereClause}`)
    .bind(...params)
    .first();

  const total = countRow?.total ?? 0;

  const querySql = `
    SELECT 
      r.id,
      r.customer_id,
      r.reward_type,
      r.discount_percent,
      r.status,
      r.cycle_number,
      r.unlocked_at,
      r.redeemed_at,
      r.redeemed_purchase_id,
      c.id as claim_id,
      c.status as claim_status,
      c.expires_at as claim_expires_at,
      q.public_number as claim_qr_number,
      p.name as claim_product_name
    FROM rewards r
    LEFT JOIN reward_claims c ON c.reward_id = r.id AND c.status = 'available'
    LEFT JOIN qr_codes q ON q.id = c.qr_code_id
    LEFT JOIN products p ON p.id = q.product_id
    ${whereClause}
    ORDER BY r.id DESC
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
    rewardType: row.reward_type,
    discountPercent: row.discount_percent,
    status: row.status,
    cycleNumber: row.cycle_number ?? 1,
    unlockedAt: row.unlocked_at,
    redeemedAt: row.redeemed_at,
    redeemedPurchaseId: row.redeemed_purchase_id,
    activeClaim: row.claim_id
      ? {
          id: row.claim_id,
          status: row.claim_status,
          expiresAt: row.claim_expires_at,
          qrNumber: row.claim_qr_number,
          productName: row.claim_product_name
        }
      : null
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

export async function cancelReward(db, rewardId) {
  const id = Number.parseInt(rewardId, 10);
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, code: "REWARD_NOT_FOUND" };
  }

  const reward = await db.prepare("SELECT id, status, customer_id FROM rewards WHERE id = ?").bind(id).first();
  if (!reward) {
    return { ok: false, code: "REWARD_NOT_FOUND" };
  }

  if (reward.status === "redeemed") {
    return { ok: false, code: "REWARD_ALREADY_REDEEMED", message: "Redeemed rewards cannot be cancelled." };
  }

  if (reward.status === "cancelled") {
    return { ok: true, reward };
  }

  // Batch cancel reward and any active claims for this reward
  await db.batch([
    db.prepare("UPDATE rewards SET status = 'cancelled' WHERE id = ?").bind(id),
    db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE reward_id = ? AND status = 'available'").bind(id)
  ]);

  return { ok: true, rewardId: id, customerId: reward.customer_id };
}
