import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, adminJson } from "../../../_lib/adminResponses.js";
import { getQrByPublicNumber } from "../../../_lib/adminQr.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const publicNumber = context.params.number;
  const qr = await getQrByPublicNumber(context.env.DB, publicNumber);
  if (!qr) {
    return adminError("QR_NOT_FOUND", 404);
  }

  return adminJson({ ok: true, qr });
}
