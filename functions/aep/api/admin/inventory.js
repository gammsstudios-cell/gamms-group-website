import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminCsv, adminError, adminJson, csvEscape } from "../../_lib/adminResponses.js";
import { listInventoryMovements } from "../../_lib/inventory.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const url = new URL(context.request.url);
  const format = url.searchParams.get("format");
  const productId = url.searchParams.get("product_id");
  const page = url.searchParams.get("page") ?? 1;
  const limit = url.searchParams.get("limit") ?? 50;

  try {
    const result = await listInventoryMovements(context.env.DB, { productId, page, limit });

    if (format === "csv") {
      const headers = ["ID", "Fecha/Hora", "Producto", "Tipo Movimiento", "Cambio Cantidad", "Razón", "Nota Admin", "Actor"];
      const rows = result.items.map((m) => [
        m.id,
        m.createdAt,
        m.productName,
        m.movementType,
        m.quantityDelta,
        m.reason,
        m.adminNote ?? "",
        `${m.actorType}:${m.actorIdentifier ?? ""}`
      ]);
      const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
      return adminCsv(csv, "inventario_movimientos.csv");
    }

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}
