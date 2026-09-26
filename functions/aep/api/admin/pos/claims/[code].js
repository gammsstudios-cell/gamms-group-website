import { requireAdminAuth } from "../../../../_lib/adminAuth.js";
import { adminError, adminJson } from "../../../../_lib/adminResponses.js";
import { previewClaim, sanitizeRedemptionError } from "../../../../_lib/redemption.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const result = await previewClaim(context.env.DB, context.params.code);
  if (!result.ok) return adminError(sanitizeRedemptionError(result.code), 400);

  return adminJson({ ok: true, ...result });
}
