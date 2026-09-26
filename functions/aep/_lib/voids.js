// GAMMS AEP Administrative Purchase Void Library
import { recordInventoryMovement } from "./inventory.js";
import { logAuditEvent } from "./audit.js";

/**
 * Perform administrative void of a purchase.
 */
export async function voidPurchase(db, actor, purchaseId, reason) {
  if (!purchaseId) {
    return { valid: false, error: "ID de compra requerido" };
  }
  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    return { valid: false, error: "El motivo de anulación es obligatorio (mínimo 3 caracteres)" };
  }

  // Check if purchase exists and if already voided
  const purchase = await db.prepare(`
    SELECT p.id, p.customer_id, p.product_id, p.qr_code_id, p.discount_percent, p.created_at
    FROM purchases p
    WHERE p.id = ?
  `).bind(purchaseId).first();

  if (!purchase) {
    return { valid: false, error: "Compra no encontrada" };
  }

  const existingVoid = await db.prepare("SELECT purchase_id FROM purchase_voids WHERE purchase_id = ?").bind(purchaseId).first();
  if (existingVoid) {
    return { valid: false, error: "Esta compra ya fue anulada previamente" };
  }

  // Ensure it is the latest purchase for this customer to prevent loyalty cycle state corruption
  const latestCustomerPurchase = await db.prepare(`
    SELECT id FROM purchases WHERE customer_id = ? ORDER BY id DESC LIMIT 1
  `).bind(purchase.customer_id).first();

  if (latestCustomerPurchase?.id !== purchase.id) {
    return {
      valid: false,
      code: "VOID_LOYALTY_CONFLICT",
      error: "Solo se puede anular la compra más reciente del cliente para no corromper su ciclo de recompensas"
    };
  }

  // Check if this purchase unlocked a reward (e.g. 2nd purchase)
  const unlockedReward = await db.prepare(`
    SELECT id, status FROM rewards WHERE customer_id = ? ORDER BY id DESC LIMIT 1
  `).bind(purchase.customer_id).first();

  if (unlockedReward) {
    if (unlockedReward.status === "redeemed") {
      return {
        valid: false,
        code: "VOID_LOYALTY_CONFLICT",
        error: "No se puede anular la compra porque la recompensa generada ya fue canjeada"
      };
    }
    // Cancel available reward
    if (unlockedReward.status === "available") {
      await db.prepare("UPDATE rewards SET status = 'cancelled' WHERE id = ?").bind(unlockedReward.id).run();
      await db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE reward_id = ? AND status = 'available'").bind(unlockedReward.id).run();
    }
  }

  // Return product stock and record inventory movement
  await recordInventoryMovement(db, {
    productId: purchase.product_id,
    movementType: "return",
    quantityDelta: 1,
    reason: `Anulación administrativa de compra #${purchaseId}: ${reason.trim()}`,
    purchaseId: purchase.id,
    actorType: actor.type || "admin",
    actorIdentifier: actor.identifier || "admin"
  });

  // Record void entry
  const staffId = actor.userId || 1;
  await db.prepare(`
    INSERT INTO purchase_voids (purchase_id, voided_by_staff_id, reason)
    VALUES (?, ?, ?)
  `).bind(purchaseId, staffId, reason.trim()).run();

  await logAuditEvent(db, {
    actorType: actor.type || "admin",
    actorIdentifier: actor.identifier || "admin",
    action: "purchase.voided",
    entityType: "purchase",
    entityIdentifier: String(purchaseId),
    metadata: { reason: reason.trim() }
  });

  return { valid: true, purchaseId };
}
