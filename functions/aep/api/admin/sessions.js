// GET /aep/api/admin/sessions
import { requirePermission } from "../../_lib/staffAuth.js";
import { listActiveSessions } from "../../_lib/staffSessions.js";
import { jsonResponse } from "../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "sessions.read");
  if (!perm.authorized) return perm.response;

  const sessions = await listActiveSessions(db);
  return jsonResponse({ ok: true, sessions });
}
