import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminCsv, adminError, adminJson, csvEscape } from "../../_lib/adminResponses.js";
import { listCustomers } from "../../_lib/customersAdmin.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const url = new URL(context.request.url);
  const format = url.searchParams.get("format");
  const query = url.searchParams.get("q") ?? "";
  const page = url.searchParams.get("page") ?? 1;
  const limit = url.searchParams.get("limit") ?? 50;

  try {
    const result = await listCustomers(context.env.DB, { query, page, limit });

    if (format === "csv") {
      const headers = ["Cliente", "Compras Totales", "Posición Ciclo", "Rewards Ganados", "Rewards Usados", "Gastado (C$)", "Primera Actividad", "Última Actividad"];
      const rows = result.items.map((c) => [
        c.idMasked,
        c.purchaseCount,
        `${c.cyclePosition}/3`,
        c.rewardsEarned,
        c.rewardsRedeemed,
        (c.totalSpentCents / 100).toFixed(2),
        c.createdAt,
        c.lastSeenAt
      ]);
      const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
      return adminCsv(csv, "clientes_anonimos.csv");
    }

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}
