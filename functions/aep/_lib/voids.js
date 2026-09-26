// GAMMS AEP Administrative Purchase Void Library
import { logAuditEvent } from "./audit.js";

const MIN_VOID_REASON_LENGTH = 3;
const MAX_VOID_REASON_LENGTH = 500;

export function normalizeVoidReason(reason) {
  if (typeof reason !== "string") {
    return {
      valid: false,
      code: "INVALID_VOID_REASON",
      error: "El motivo de anulacion es obligatorio y debe ser un texto"
    };
  }
  const text = reason.trim();
  if (text.length < MIN_VOID_REASON_LENGTH || text.length > MAX_VOID_REASON_LENGTH) {
    return {
      valid: false,
      code: "INVALID_VOID_REASON",
      error: `El motivo de anulacion es obligatorio (${MIN_VOID_REASON_LENGTH}-${MAX_VOID_REASON_LENGTH} caracteres)`
    };
  }
  return { valid: true, reason: text };
}

export function resolveVoidActor(actor = {}) {
  if (actor.isEnvOwner === true) {
    return {
      valid: true,
      actorType: "owner_env",
      staffId: null,
      actorRef: "env:admin",
      auditActorType: "admin",
      auditActorIdentifier: "env:admin"
    };
  }

  const staffId = Number.parseInt(actor.userId, 10);
  if (actor.type === "staff" && Number.isInteger(staffId) && staffId > 0) {
    const identifier = String(actor.identifier || actor.displayName || `staff-${staffId}`).trim() || `staff-${staffId}`;
    return {
      valid: true,
      actorType: "staff",
      staffId,
      actorRef: null,
      auditActorType: "admin",
      auditActorIdentifier: `staff:${staffId}:${identifier}`
    };
  }

  return {
    valid: false,
    code: "INVALID_VOID_ACTOR",
    error: "Actor de anulacion invalido"
  };
}

/**
 * Perform administrative void of a purchase.
 */
export async function voidPurchase(db, actor, purchaseId, reason) {
  if (!purchaseId) {
    return { valid: false, error: "ID de compra requerido" };
  }

  const reasonResult = normalizeVoidReason(reason);
  if (!reasonResult.valid) return reasonResult;

  const voidActor = resolveVoidActor(actor);
  if (!voidActor.valid) return voidActor;

  // Check if purchase exists
  const purchase = await db.prepare(`
    SELECT p.id, p.customer_id, p.product_id, p.qr_code_id, p.discount_percent, p.created_at
    FROM purchases p
    WHERE p.id = ?
  `).bind(purchaseId).first();

  if (!purchase) {
    return { valid: false, error: "Compra no encontrada" };
  }

  // Check if already voided
  const existingVoid = await db.prepare("SELECT purchase_id FROM purchase_voids WHERE purchase_id = ?").bind(purchaseId).first();
  if (existingVoid) {
    return { valid: false, error: "Esta compra ya fue anulada previamente" };
  }

  // Ensure it is the latest NON-VOIDED purchase for this customer to prevent loyalty cycle state corruption
  const latestCustomerPurchase = await db.prepare(`
    SELECT p.id
    FROM purchases p
    WHERE p.customer_id = ?
      AND NOT EXISTS (SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = p.id)
    ORDER BY p.id DESC
    LIMIT 1
  `).bind(purchase.customer_id).first();

  if (latestCustomerPurchase?.id !== purchase.id) {
    return {
      valid: false,
      code: "VOID_LOYALTY_CONFLICT",
      error: "Solo se puede anular la compra mas reciente del cliente para no corromper su ciclo de recompensas"
    };
  }

  // Check if this purchase REDEEMED a reward
  const redeemedReward = await db.prepare(`
    SELECT id FROM rewards WHERE redeemed_purchase_id = ?
    UNION
    SELECT id FROM reward_claims WHERE redeemed_purchase_id = ?
    LIMIT 1
  `).bind(purchase.id, purchase.id).first();

  if (redeemedReward) {
    return {
      valid: false,
      code: "VOID_LOYALTY_CONFLICT",
      error: "No se puede anular una compra que redimio una recompensa"
    };
  }

  // Determine if this purchase GENERATED a reward using cycle position
  const activePurchases = await db.prepare(`
    SELECT p.id
    FROM purchases p
    WHERE p.customer_id = ?
      AND NOT EXISTS (SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = p.id)
    ORDER BY p.id ASC
  `).bind(purchase.customer_id).all();

  const purchaseList = activePurchases?.results || [];
  const index = purchaseList.findIndex((row) => row.id === purchase.id);
  const position = index >= 0 ? index + 1 : 0;

  let rewardToCancel = null;
  if (position > 0 && position % 3 === 2) {
    const cycleNumber = Math.floor((position - 1) / 3) + 1;
    const generatedReward = await db.prepare(`
      SELECT id, status FROM rewards
      WHERE customer_id = ? AND reward_type = 'third_drink_50' AND cycle_number = ?
    `).bind(purchase.customer_id, cycleNumber).first();

    if (generatedReward) {
      if (generatedReward.status === "redeemed") {
        return {
          valid: false,
          code: "VOID_LOYALTY_CONFLICT",
          error: "No se puede anular la compra porque la recompensa generada ya fue canjeada"
        };
      }
      if (generatedReward.status === "available") {
        rewardToCancel = generatedReward;
      }
    }
  }

  // Build atomic batch statements
  const statements = [
    // 1. Record void entry in purchase_voids table
    db.prepare(`
      INSERT INTO purchase_voids (purchase_id, actor_type, voided_by_staff_id, actor_ref, reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(purchaseId, voidActor.actorType, voidActor.staffId, voidActor.actorRef, reasonResult.reason)
  ];

  // 2. Cancel reward & active claim if applicable
  if (rewardToCancel) {
    statements.push(
      db.prepare("UPDATE rewards SET status = 'cancelled' WHERE id = ? AND status = 'available'").bind(rewardToCancel.id),
      db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE reward_id = ? AND status = 'available'").bind(rewardToCancel.id)
    );
  }

  // 3. Increment product stock
  statements.push(
    db.prepare("UPDATE products SET stock_quantity = stock_quantity + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(purchase.product_id)
  );

  // 4. Record inventory movement return
  statements.push(
    db.prepare(`
      INSERT INTO inventory_movements (
        product_id, movement_type, quantity_delta, reason, purchase_id, actor_type, actor_identifier, created_at
      ) VALUES (?, 'return', 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      purchase.product_id,
      `Anulacion administrativa de compra #${purchaseId}: ${reasonResult.reason}`,
      purchase.id,
      voidActor.auditActorType,
      voidActor.auditActorIdentifier
    )
  );

  // 5. Audit event
  statements.push(
    db.prepare(`
      INSERT INTO audit_events (
        actor_type, actor_identifier, action, entity_type, entity_identifier, metadata_json, created_at
      ) VALUES (?, ?, 'purchase.voided', 'purchase', ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      voidActor.auditActorType,
      voidActor.auditActorIdentifier,
      String(purchaseId),
      JSON.stringify({
        reason: reasonResult.reason,
        actorType: voidActor.actorType,
        actorRef: voidActor.actorRef,
        staffId: voidActor.staffId
      })
    )
  );

  try {
    await db.batch(statements);
  } catch (error) {
    return {
      valid: false,
      code: "VOID_FAILED",
      error: "Fallo al anular la compra o la compra ya fue anulada por otra operacion"
    };
  }

  return { valid: true, purchaseId };
}
