// GET & POST /aep/api/admin/users
import { requirePermission } from "../../_lib/staffAuth.js";
import { listStaffUsers, createStaffUser } from "../../_lib/staffUsers.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "users.read");
  if (!perm.authorized) return perm.response;

  const users = await listStaffUsers(db);
  return jsonResponse({ ok: true, users });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "users.manage");
  if (!perm.authorized) return perm.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const result = await createStaffUser(db, perm.actor, body);
  if (!result.valid) {
    return errorJson(result.error, 400, "USER_CREATE_FAILED");
  }

  return jsonResponse({ ok: true, userId: result.userId, username: result.username });
}
