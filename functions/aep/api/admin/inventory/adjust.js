import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { logAuditEvent } from "../../../_lib/audit.js";
import { recordInventoryMovement } from "../../../_lib/inventory.js";

export async function onRequestPost(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const csrf = validateCsrf(context.request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const result = await recordInventoryMovement(context.env.DB, {
    productId: body?.product_id ?? body?.productId,
    quantityDelta: body?.quantity_delta ?? body?.quantityDelta,
    movementType: body?.movement_type ?? body?.movementType ?? "adjustment",
    reason: body?.reason ?? "Manual administrative adjustment",
    adminNote: body?.admin_note ?? body?.adminNote ?? null,
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin"
  });

  if (!result.ok) {
    return adminError(result.code, 400, result.message);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "stock_adjusted",
    entityType: "product",
    entityIdentifier: String(result.movement.productId),
    metadata: {
      productName: result.movement.productName,
      quantityDelta: result.movement.quantityDelta,
      previousStock: result.movement.previousStock,
      newStock: result.movement.newStock,
      movementType: result.movement.movementType
    }
  });

  return adminJson({ ok: true, movement: result.movement });
}
