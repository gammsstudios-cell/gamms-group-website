import { requirePermission } from "../../_lib/staffAuth.js";
import { adminError, adminJson, validateCsrf } from "../../_lib/adminResponses.js";
import { getSettings, updateSettings } from "../../_lib/settings.js";

export async function onRequestGet({ request, env }) {
  const perm = await requirePermission(request, env, env.DB, "settings.read");
  if (!perm.authorized) return perm.response;

  const settings = await getSettings(env.DB);
  return adminJson({
    ok: true,
    event: {
      active: settings.event_active !== "false",
      rewardsEnabled: settings.rewards_enabled !== "false",
      legacyEveryN: Number(settings.reward_every_n_purchases || 3),
      legacyDiscountPercent: Number(settings.reward_discount_percent || 50)
    }
  });
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

  const updates = {};
  if (body?.active !== undefined) updates.event_active = body.active ? "true" : "false";
  if (body?.rewardsEnabled !== undefined) updates.rewards_enabled = body.rewardsEnabled ? "true" : "false";

  await updateSettings(env.DB, updates);
  const settings = await getSettings(env.DB);
  return adminJson({ ok: true, event: { active: settings.event_active !== "false" } });
}
