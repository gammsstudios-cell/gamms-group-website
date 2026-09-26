// GET /aep/api/staff/shifts/current
import { requirePermission } from "../../../_lib/staffAuth.js";
import { getCurrentShift } from "../../../_lib/shifts.js";
import { jsonResponse } from "../../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "shifts.use");
  if (!perm.authorized) return perm.response;

  const shift = await getCurrentShift(db, perm.actor.userId);

  return jsonResponse({
    ok: true,
    shift
  });
}
