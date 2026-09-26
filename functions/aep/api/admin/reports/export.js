// GET /aep/api/admin/reports/export
import { requirePermission } from "../../../_lib/staffAuth.js";
import { exportEventReportCsv } from "../../../_lib/eventReports.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "reports.export");
  if (!perm.authorized) return perm.response;

  const csvContent = await exportEventReportCsv(db);
  const filename = `aep_event_closing_report_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
