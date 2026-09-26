// POST /aep/api/admin/sessions/revoke
import { requirePermission } from "../../../_lib/staffAuth.js";
import { revokeSession, revokeAllUserSessions } from "../../../_lib/staffSessions.js";
import { jsonResponse, errorJson } from "../../../_lib/adminResponses.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "sessions.revoke");
  if (!perm.authorized) return perm.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  if (body.userId) {
    await revokeAllUserSessions(db, perm.actor, parseInt(body.userId, 10));
    return jsonResponse({ ok: true, message: "Todas las sesiones del usuario han sido revocadas" });
  }

  if (body.sessionId) {
    await revokeSession(db, perm.actor, body.sessionId);
    return jsonResponse({ ok: true, message: "Sesión revocada exitosamente" });
  }

  return errorJson("sessionId o userId requerido", 400, "PARAM_REQUIRED");
}
