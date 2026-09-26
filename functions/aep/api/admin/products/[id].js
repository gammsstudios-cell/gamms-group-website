import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { logAuditEvent } from "../../../_lib/audit.js";
import { getProductById, updateProduct } from "../../../_lib/products.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const productId = context.params.id;
  const product = await getProductById(context.env.DB, productId);
  if (!product) {
    return adminError("PRODUCT_NOT_FOUND", 404);
  }

  return adminJson({ ok: true, product });
}

export async function onRequestPut(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const csrf = validateCsrf(context.request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  const productId = context.params.id;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const result = await updateProduct(context.env.DB, productId, body);
  if (!result.ok) {
    return adminError(result.code, 400, result.message);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "product_updated",
    entityType: "product",
    entityIdentifier: String(productId),
    metadata: { name: result.product.name, priceCents: result.product.priceCents, active: result.product.active }
  });

  return adminJson({ ok: true, product: result.product });
}
