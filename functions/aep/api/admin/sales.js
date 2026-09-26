import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminCsv, adminError, adminJson } from "../../_lib/adminResponses.js";
import { buildSalesCsv, listSales } from "../../_lib/sales.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const url = new URL(context.request.url);
  const format = url.searchParams.get("format");
  const query = url.searchParams.get("q") ?? "";
  const productId = url.searchParams.get("product_id");
  const discountOnly = url.searchParams.get("discount") === "true";
  const date = url.searchParams.get("date") ?? "";
  const period = url.searchParams.get("period") ?? "all";
  const page = url.searchParams.get("page") ?? 1;
  const limit = url.searchParams.get("limit") ?? 50;

  try {
    const result = await listSales(context.env.DB, {
      query,
      productId,
      discountOnly,
      date,
      period,
      page,
      limit
    });

    if (format === "csv") {
      const csv = buildSalesCsv(result.items);
      return adminCsv(csv, "ventas_historicas.csv");
    }

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}
