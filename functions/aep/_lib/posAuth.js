import { authenticateStaff } from "./staffAuth.js";
import { requireSellerAuth } from "./sellerAuth.js";
import { userHasPermission } from "./rbac.js";
import { errorJson } from "./adminResponses.js";
import { getCurrentShift } from "./shifts.js";

export async function requirePosActor(request, env, db) {
  const staffAuth = await authenticateStaff(request, env, db);
  if (staffAuth.authenticated) {
    if (!userHasPermission(staffAuth.actor.permissions, "pos.access")) {
      return { ok: false, response: errorJson("PERMISSION_DENIED", 403) };
    }
    const shift = staffAuth.actor.userId ? await getCurrentShift(db, staffAuth.actor.userId) : null;
    return {
      ok: true,
      mode: "staff",
      actorType: staffAuth.actor.type || "staff",
      actorIdentifier: staffAuth.actor.identifier || String(staffAuth.actor.userId || "staff"),
      staffUserId: staffAuth.actor.userId || null,
      shiftId: shift?.id || null
    };
  }

  const sellerAuth = await requireSellerAuth(request, env);
  if (!sellerAuth.ok) {
    return { ok: false, response: errorJson(sellerAuth.code, sellerAuth.status) };
  }

  return {
    ok: true,
    mode: "seller",
    actorType: "seller",
    actorIdentifier: "legacy-seller",
    staffUserId: null,
    shiftId: null
  };
}
