import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminCsv, adminError, adminJson, csvEscape, validateCsrf } from "../../_lib/adminResponses.js";
import { logAuditEvent } from "../../_lib/audit.js";
import { createProduct, listProducts } from "../../_lib/products.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const url = new URL(context.request.url);
  const format = url.searchParams.get("format");
  const query = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const active = url.searchParams.get("active");
  const page = url.searchParams.get("page") ?? 1;
  const limit = url.searchParams.get("limit") ?? 50;

  try {
    const result = await listProducts(context.env.DB, { query, category, active, page, limit });

    if (format === "csv") {
      const headers = ["ID", "Nombre", "Categoría", "SKU", "Precio (C$)", "Costo (C$)", "Stock", "Bajo Stock", "Ventas", "Revenue (C$)", "Estado"];
      const rows = result.items.map((p) => [
        p.id,
        p.name,
        p.category,
        p.sku,
        (p.priceCents / 100).toFixed(2),
        p.costCents ? (p.costCents / 100).toFixed(2) : "",
        p.stockQuantity,
        p.isLowStock ? "SÍ" : "NO",
        p.salesCount,
        (p.revenueCents / 100).toFixed(2),
        p.active ? "Activo" : "Inactivo"
      ]);
      const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
      return adminCsv(csv, "productos.csv");
    }

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}

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

  const result = await createProduct(context.env.DB, body);
  if (!result.ok) {
    return adminError(result.code, 400, result.message);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "product_created",
    entityType: "product",
    entityIdentifier: String(result.product.id),
    metadata: { name: result.product.name, priceCents: result.product.priceCents }
  });

  return adminJson({ ok: true, product: result.product }, { status: 201 });
}
