// GET & PUT /aep/api/admin/users/[id]
import { requirePermission } from "../../../_lib/staffAuth.js";
import { getStaffUserById, updateStaffUser } from "../../../_lib/staffUsers.js";
import { jsonResponse, errorJson } from "../../../_lib/adminResponses.js";

export async function onRequestGet(context) {
  const db = context.env.DB;
  const perm = await requirePermission(context.request, context.env, db, "users.read");
  if (!perm.authorized) return perm.response;

  const userId = parseInt(context.params.id, 10);
  const user = await getStaffUserById(db, userId);
  if (!user) return errorJson("Usuario no encontrado", 404, "USER_NOT_FOUND");

  return jsonResponse({ ok: true, user });
}

export async function onRequestPut(context) {
  const db = context.env.DB;
  const perm = await requirePermission(context.request, context.env, db, "users.manage");
  if (!perm.authorized) return perm.response;

  const userId = parseInt(context.params.id, 10);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const result = await updateStaffUser(db, perm.actor, userId, body);
  if (!result.valid) {
    return errorJson(result.error, 400, "USER_UPDATE_FAILED");
  }

  return jsonResponse({ ok: true, userId });
}
