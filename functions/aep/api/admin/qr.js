import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminCsv, adminError, adminJson, csvEscape } from "../../_lib/adminResponses.js";
import { listQrCodes } from "../../_lib/adminQr.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const url = new URL(context.request.url);
  const format = url.searchParams.get("format");
  const query = url.searchParams.get("q") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const productId = url.searchParams.get("product_id");
  const page = url.searchParams.get("page") ?? 1;
  const limit = url.searchParams.get("limit") ?? 50;

  try {
    const result = await listQrCodes(context.env.DB, { query, status, productId, page, limit });

    if (format === "csv") {
      const headers = ["Número Público", "Producto", "Precio (C$)", "Estado", "Creado", "Usado En"];
      const rows = result.items.map((q) => [
        q.publicNumber,
        q.productName,
        (q.productPriceCents / 100).toFixed(2),
        q.status,
        q.createdAt,
        q.usedAt ?? ""
      ]);
      const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
      return adminCsv(csv, "codigos_qr.csv");
    }

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}
