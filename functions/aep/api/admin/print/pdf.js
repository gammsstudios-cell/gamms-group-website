import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, validateCsrf, DEFAULT_SECURITY_HEADERS } from "../../../_lib/adminResponses.js";
import { generateLabelsPdf } from "../../../_lib/printPdf.js";
import { getPrintProfile } from "../../../_lib/printProfiles.js";

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

  const profile = await getPrintProfile(context.env.DB, body?.printProfileId ?? body?.print_profile_id);
  const result = await generateLabelsPdf({
    labels: body?.items ?? body?.labels ?? [],
    profile,
    startSlot: body?.startSlot ?? body?.start_slot ?? 1,
    drawGuides: body?.drawGuides === true
  });
  if (!result.ok) return adminError(result.code, 400);

  return new Response(result.bytes, {
    status: 200,
    headers: {
      ...DEFAULT_SECURITY_HEADERS,
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename=\"gamms-aep-labels.pdf\"",
      "cache-control": "no-store"
    }
  });
}
