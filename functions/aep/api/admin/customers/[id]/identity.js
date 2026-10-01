import { requirePermission } from "../../../../_lib/staffAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../../_lib/adminResponses.js";
import { ensureCustomerIdentityToken, revokeCustomerIdentityToken } from "../../../../_lib/customerIdentity.js";

export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "pos.access");
  if (!perm.authorized) return perm.response;

  const csrf = validateCsrf(request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await ensureCustomerIdentityToken(db, params.id, {
    rotate: body?.rotate === true,
    request
  });
  if (!result.ok) return adminError(result.code, 400);
  return adminJson({ ok: true, alreadyIssued: Boolean(result.alreadyIssued), identity: result.identity });
}

export async function onRequestDelete({ request, env, params }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "customers.manage");
  if (!perm.authorized) return perm.response;

  const csrf = validateCsrf(request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  await revokeCustomerIdentityToken(db, params.id);
  return adminJson({ ok: true });
}
