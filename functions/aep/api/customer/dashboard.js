import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";
import { getCustomerDashboard } from "../../_lib/customerDashboard.js";

export async function onRequestGet({ request, env }) {
  const result = await getCustomerDashboard(env.DB, request);
  if (!result.ok) {
    return errorJson(result.code, result.code === "CUSTOMER_AUTH_REQUIRED" ? 401 : 404, {}, {
      headers: { "Cache-Control": "no-store" }
    });
  }
  return jsonResponse(result, {
    headers: { "Cache-Control": "no-store" }
  });
}
