import { requireAdminAuth } from "../../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../../_lib/adminResponses.js";
import { updatePrintProfile } from "../../../../_lib/printProfiles.js";

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

  const result = await updatePrintProfile(context.env.DB, context.params.id, body);
  if (!result.ok) return adminError(result.code, result.code === "PROFILE_NOT_FOUND" ? 404 : 400);
  return adminJson({ ok: true, profile: result.profile });
}
