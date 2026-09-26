// POST /aep/api/staff/logout
import { parseCookies } from "../../_lib/cookies.js";
import { STAFF_COOKIE_NAME, clearStaffCookie, revokeSession } from "../../_lib/staffSessions.js";
import { clearAdminCookie } from "../../_lib/adminAuth.js";
import { clearSellerCookie } from "../../_lib/sellerAuth.js";
import { jsonResponse } from "../../_lib/adminResponses.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const cookies = parseCookies(request.headers.get("Cookie"));
  const staffToken = cookies.get(STAFF_COOKIE_NAME);

  if (staffToken) {
    try {
      const tokenHash = await (await import("../../_lib/crypto.js")).sha256Hex(staffToken);
      await db.prepare("DELETE FROM aep_staff_sessions WHERE token_hash = ?").bind(tokenHash).run();
    } catch {}
  }

  const isSecure = new URL(request.url).protocol === "https:";
  const headers = new Headers();
  headers.append("Set-Cookie", clearStaffCookie(isSecure));
  headers.append("Set-Cookie", clearAdminCookie(request));
  headers.append("Set-Cookie", clearSellerCookie(request));

  return jsonResponse({ ok: true }, 200, headers);
}
