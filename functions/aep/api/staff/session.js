// GET /aep/api/staff/session
import { authenticateStaff } from "../../_lib/staffAuth.js";
import { jsonResponse } from "../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const auth = await authenticateStaff(request, env, db);

  if (!auth.authenticated) {
    return jsonResponse({ authenticated: false }, 200);
  }

  return jsonResponse({
    authenticated: true,
    user: auth.session
  });
}
