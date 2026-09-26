// GET & PUT /aep/api/admin/roles/[id]
import { requirePermission } from "../../../_lib/staffAuth.js";
import { getRoleById, updateRole } from "../../../_lib/staffRoles.js";
import { jsonResponse, errorJson } from "../../../_lib/adminResponses.js";

export async function onRequestGet(context) {
  const db = context.env.DB;
  const perm = await requirePermission(context.request, context.env, db, "roles.read");
  if (!perm.authorized) return perm.response;

  const roleId = parseInt(context.params.id, 10);
  const role = await getRoleById(db, roleId);
  if (!role) return errorJson("Rol no encontrado", 404, "ROLE_NOT_FOUND");

  return jsonResponse({ ok: true, role });
}

export async function onRequestPut(context) {
  const db = context.env.DB;
  const perm = await requirePermission(context.request, context.env, db, "roles.manage");
  if (!perm.authorized) return perm.response;

  const roleId = parseInt(context.params.id, 10);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const result = await updateRole(db, perm.actor, roleId, body);
  if (!result.valid) {
    return errorJson(result.error, 400, "ROLE_UPDATE_FAILED");
  }

  return jsonResponse({ ok: true, roleId });
}
