// GET /aep/api/customer/me
import { getCustomerIdFromRequest, buildCustomerCookie, generateCustomerId } from "../../_lib/cookies.js";
import { getCustomerProfile } from "../../_lib/customerProfile.js";
import { jsonResponse } from "../../_lib/adminResponses.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  let customerId = getCustomerIdFromRequest(request);
  let newCookie = null;

  if (!customerId) {
    customerId = generateCustomerId();
    newCookie = buildCustomerCookie(customerId, request);
    await db.prepare("INSERT INTO customers (id, last_seen_at) VALUES (?, CURRENT_TIMESTAMP)").bind(customerId).run();
  }

  const profile = await getCustomerProfile(db, customerId);

  const headers = new Headers();
  if (newCookie) {
    headers.set("Set-Cookie", newCookie);
  }

  return jsonResponse({
    ok: true,
    customer: profile
  }, 200, headers);
}
