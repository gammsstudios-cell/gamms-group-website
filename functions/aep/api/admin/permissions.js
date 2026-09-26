// GET /aep/api/admin/permissions
import { requirePermission } from "../../_lib/staffAuth.js";
import { listAllPermissions } from "../../_lib/staffRoles.js";
import { jsonResponse } from "../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "roles.read");
  if (!perm.authorized) return perm.response;

  const permissions = await listAllPermissions(db);
  return jsonResponse({ ok: true, permissions });
}
