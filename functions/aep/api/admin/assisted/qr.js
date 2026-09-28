import { requirePermission } from "../../../_lib/staffAuth.js";
import { adminError, adminJson } from "../../../_lib/adminResponses.js";
import { resolvePhysicalQrInput } from "../../../_lib/physicalQr.js";

export async function onRequestGet({ request, env }) {
  const perm = await requirePermission(request, env, env.DB, "pos.access");
  if (!perm.authorized) return perm.response;

  const input = new URL(request.url).searchParams.get("input") || "";
  const result = await resolvePhysicalQrInput(env.DB, input);
  if (!result.ok) return adminError(result.code, 400);

  return adminJson({
    ok: true,
    qr: {
      publicNumber: result.qr.publicNumber,
      status: result.qr.status
    },
    product: result.qr.product
  });
}
