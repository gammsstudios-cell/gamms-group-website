// GET /aep/api/admin/reports/event
import { requirePermission } from "../../../_lib/staffAuth.js";
import { getEventReport } from "../../../_lib/eventReports.js";
import { jsonResponse } from "../../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "reports.read");
  if (!perm.authorized) return perm.response;

  const report = await getEventReport(db);
  return jsonResponse({ ok: true, report });
}
