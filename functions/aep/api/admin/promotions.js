import { requirePermission } from "../../_lib/staffAuth.js";
import { adminError, adminJson, validateCsrf } from "../../_lib/adminResponses.js";
import { listProductPromotionRules, upsertProductPromotionRule } from "../../_lib/promotions.js";

export async function onRequestGet({ request, env }) {
  const perm = await requirePermission(request, env, env.DB, "settings.read");
  if (!perm.authorized) return perm.response;

  return adminJson({ ok: true, items: await listProductPromotionRules(env.DB) });
}

export async function onRequestPut({ request, env }) {
  const perm = await requirePermission(request, env, env.DB, "settings.manage");
  if (!perm.authorized) return perm.response;

  const csrf = validateCsrf(request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body;
  try {
    body = await request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const result = await upsertProductPromotionRule(env.DB, body || {});
  if (!result.ok) return adminError(result.code, 400);
  return adminJson({ ok: true, rule: result.rule });
}
