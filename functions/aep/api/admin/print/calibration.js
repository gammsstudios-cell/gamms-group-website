import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { getSlotPosition, profileCapacity } from "../../../_lib/printProfiles.js";
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
  const slots = [];
  for (let slot = 1; slot <= profileCapacity(profile); slot += 1) {
    const box = getSlotPosition(profile, slot);
    slots.push({ slot, row: box.row, column: box.column, x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return adminJson({ ok: true, profile, slots });
}
