// GET /aep/api/admin/shifts
import { requirePermission } from "../../_lib/staffAuth.js";
import { listShifts } from "../../_lib/shifts.js";
import { jsonResponse } from "../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "shifts.manage");
  if (!perm.authorized) return perm.response;

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ? parseInt(url.searchParams.get("userId"), 10) : null;
  const status = url.searchParams.get("status") || null;

  const shifts = await listShifts(db, { userId, status });
  return jsonResponse({ ok: true, shifts });
}
