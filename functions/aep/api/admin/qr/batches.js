import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, adminJson } from "../../../_lib/adminResponses.js";
import { listQrBatches } from "../../../_lib/adminQr.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const url = new URL(context.request.url);
  const result = await listQrBatches(context.env.DB, {
    page: url.searchParams.get("page") ?? 1,
    limit: url.searchParams.get("limit") ?? 25
  });
  return adminJson({ ok: true, ...result });
}
