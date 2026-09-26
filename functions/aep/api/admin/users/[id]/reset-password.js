// POST /aep/api/admin/users/[id]/reset-password
import { requirePermission } from "../../../../_lib/staffAuth.js";
import { resetStaffUserPassword } from "../../../../_lib/staffUsers.js";
import { jsonResponse, errorJson } from "../../../../_lib/adminResponses.js";

export async function onRequestPost(context) {
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

  const newPassword = body.newPassword || body.password || "";
  if (!newPassword) return errorJson("Nueva contraseña requerida", 400, "PASSWORD_REQUIRED");

  const result = await resetStaffUserPassword(db, perm.actor, userId, newPassword);
  if (!result.valid) {
    return errorJson(result.error, 400, "RESET_FAILED");
  }

  return jsonResponse({ ok: true, message: "Contraseña reseteada exitosamente" });
}
