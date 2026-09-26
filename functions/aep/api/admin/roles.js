// GET & POST /aep/api/admin/roles
import { requirePermission } from "../../_lib/staffAuth.js";
import { listRoles, createRole } from "../../_lib/staffRoles.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "roles.read");
  if (!perm.authorized) return perm.response;

  const roles = await listRoles(db);
  return jsonResponse({ ok: true, roles });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "roles.manage");
  if (!perm.authorized) return perm.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const result = await createRole(db, perm.actor, body);
  if (!result.valid) {
    return errorJson(result.error, 400, "ROLE_CREATE_FAILED");
  }

  return jsonResponse({ ok: true, roleId: result.roleId, name: result.name });
}
