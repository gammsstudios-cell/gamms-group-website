import { requireAdminAuth } from "../../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../../_lib/adminResponses.js";
import { logAuditEvent } from "../../../../_lib/audit.js";
import { cancelReward } from "../../../../_lib/rewardsAdmin.js";

export async function onRequestPost(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const csrf = validateCsrf(context.request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  const rewardId = context.params.id;
  const result = await cancelReward(context.env.DB, rewardId);
  if (!result.ok) {
    return adminError(result.code, 400, result.message);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "reward_cancelled",
    entityType: "reward",
    entityIdentifier: String(rewardId),
    metadata: { customerId: result.customerId }
  });

  return adminJson({ ok: true, rewardId: Number(rewardId), status: "cancelled" });
}
