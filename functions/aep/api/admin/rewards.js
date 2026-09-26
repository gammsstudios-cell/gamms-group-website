import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminCsv, adminError, adminJson, csvEscape } from "../../_lib/adminResponses.js";
import { listRewards } from "../../_lib/rewardsAdmin.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const url = new URL(context.request.url);
  const format = url.searchParams.get("format");
  const status = url.searchParams.get("status") ?? "";
  const customerId = url.searchParams.get("customer_id") ?? "";
  const page = url.searchParams.get("page") ?? 1;
  const limit = url.searchParams.get("limit") ?? 50;

  try {
    const result = await listRewards(context.env.DB, { status, customerId, page, limit });

    if (format === "csv") {
      const headers = ["ID Reward", "Cliente", "Tipo", "Descuento (%)", "Estado", "Ciclo", "Desbloqueado", "Canjeado"];
      const rows = result.items.map((r) => [
        r.id,
        r.customerLabel,
        r.rewardType,
        r.discountPercent,
        r.status,
        r.cycleNumber,
        r.unlockedAt,
        r.redeemedAt ?? ""
      ]);
      const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
      return adminCsv(csv, "rewards.csv");
    }

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}
