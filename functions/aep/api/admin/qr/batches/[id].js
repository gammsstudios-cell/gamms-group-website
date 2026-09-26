import { requireAdminAuth } from "../../../../_lib/adminAuth.js";
import { adminError, adminJson } from "../../../../_lib/adminResponses.js";
import { getQrBatch } from "../../../../_lib/adminQr.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const batch = await getQrBatch(context.env.DB, context.params.id);
  if (!batch) return adminError("QR_BATCH_NOT_FOUND", 404);
  return adminJson({ ok: true, batch });
}
