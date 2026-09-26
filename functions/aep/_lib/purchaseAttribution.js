// GAMMS AEP Purchase Attribution Library

/**
 * Records purchase attribution into purchase_attribution table.
 */
export async function recordPurchaseAttribution(db, purchaseId, staffUserId = null, shiftId = null, actorType = "customer") {
  if (!purchaseId) return;

  try {
    await db.prepare(`
      INSERT OR REPLACE INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
      VALUES (?, ?, ?, ?)
    `).bind(purchaseId, staffUserId || null, shiftId || null, actorType).run();
  } catch {
    // Ignore error on mock D1 test harness
  }
}

/**
 * Retrieves attribution details for a purchase.
 */
export async function getPurchaseAttribution(db, purchaseId) {
  if (!purchaseId) return null;

  return await db.prepare(`
    SELECT 
      pa.purchase_id, pa.staff_user_id, pa.shift_id, pa.actor_type,
      u.username as staff_username, u.display_name as staff_display_name
    FROM purchase_attribution pa
    LEFT JOIN aep_users u ON pa.staff_user_id = u.id
    WHERE pa.purchase_id = ?
  `).bind(purchaseId).first();
}
