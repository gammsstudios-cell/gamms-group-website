import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../_lib/adminResponses.js";
import { logAuditEvent } from "../../_lib/audit.js";
import { getSettings, updateSettings } from "../../_lib/settings.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  try {
    const settings = await getSettings(context.env.DB);
    return adminJson({ ok: true, settings });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}

export async function onRequestPut(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const csrf = validateCsrf(context.request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const result = await updateSettings(context.env.DB, body?.settings ?? body);
  if (!result.ok) {
    return adminError(result.code, 400);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "settings_updated",
    entityType: "system_settings",
    metadata: { updatedKeys: result.updatedKeys }
  });

  return adminJson({ ok: true, settings: result.settings });
}
