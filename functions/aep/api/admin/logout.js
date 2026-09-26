import { clearAdminCookie, requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminJson } from "../../_lib/adminResponses.js";
import { logAuditEvent } from "../../_lib/audit.js";

export async function onRequestPost(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (auth.ok) {
    await logAuditEvent(context.env.DB, {
      actorType: "admin",
      actorIdentifier: auth.payload.sub ?? "admin",
      action: "admin_logout",
      entityType: "session"
    });
  }

  const cookie = clearAdminCookie(context.request);
  return adminJson({ ok: true }, { headers: { "set-cookie": cookie } });
}
