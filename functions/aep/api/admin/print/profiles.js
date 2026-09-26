import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { createPrintProfile, listPrintProfiles } from "../../../_lib/printProfiles.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const profiles = await listPrintProfiles(context.env.DB);
  return adminJson({ ok: true, profiles });
}

export async function onRequestPost(context) {
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

  const result = await createPrintProfile(context.env.DB, body);
  if (!result.ok) return adminError(result.code, 400);
  return adminJson({ ok: true, profile: result.profile }, { status: 201 });
}
