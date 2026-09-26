// POST /aep/api/staff/shifts/close
import { requirePermission } from "../../../_lib/staffAuth.js";
import { closeShift } from "../../../_lib/shifts.js";
import { jsonResponse, errorJson } from "../../../_lib/adminResponses.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "shifts.use");
  if (!perm.authorized) return perm.response;

  let body = {};
  try {
    const text = await request.text();
    if (text && text.trim()) body = JSON.parse(text);
  } catch {}

  const result = await closeShift(db, perm.actor, body.closingNote || null);
  if (!result.valid) {
    return errorJson(result.error, 400, "SHIFT_CLOSE_FAILED");
  }

  return jsonResponse({
    ok: true,
    shiftId: result.shiftId,
    endedAt: result.endedAt
  });
}
