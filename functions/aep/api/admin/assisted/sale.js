import { requirePermission } from "../../../_lib/staffAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { registerPurchase, sanitizePurchaseError } from "../../../_lib/purchases.js";
import { getCurrentShift } from "../../../_lib/shifts.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "pos.access");
  if (!perm.authorized) return perm.response;

  const csrf = validateCsrf(request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body;
  try {
    body = await request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const customerId = String(body?.customerId || "").trim();
  const token = body?.token;
  if (!customerId) return adminError("CUSTOMER_REQUIRED", 400);

  const customer = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!customer) return adminError("CUSTOMER_NOT_FOUND", 404);

  const staffUserId = perm.actor?.userId || null;
  const shift = staffUserId ? await getCurrentShift(db, staffUserId) : null;

  const result = await registerPurchase(db, request, token, {
    customerId,
    allowPhysicalQrInput: true,
    actor: {
      actorType: "staff",
      actorIdentifier: perm.actor?.identifier || perm.actor?.displayName || "staff",
      reason: "Venta asistida",
      staffUserId,
      shiftId: shift?.id || null
    }
  });

  if (!result.ok) return adminError(sanitizePurchaseError(result.code), 400, result);

  return adminJson({
    ok: true,
    purchase: result.purchase,
    progress: result.progress
  });
}
