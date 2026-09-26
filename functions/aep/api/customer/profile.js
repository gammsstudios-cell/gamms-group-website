// PUT /aep/api/customer/profile
import { getCustomerIdFromRequest } from "../../_lib/cookies.js";
import { updateCustomerProfile, getCustomerProfile } from "../../_lib/customerProfile.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";

export async function onRequestPut({ request, env }) {
  const db = env.DB;
  const customerId = getCustomerIdFromRequest(request);
  if (!customerId) {
    return errorJson("Cookie de cliente no encontrada", 401, "CUSTOMER_REQUIRED");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Cuerpo JSON inválido", 400, "INVALID_JSON");
  }

  const result = await updateCustomerProfile(db, customerId, body.displayName || "");
  if (!result.valid) {
    return errorJson(result.error, 400, "INVALID_CUSTOMER_NAME");
  }

  const profile = await getCustomerProfile(db, customerId);

  return jsonResponse({
    ok: true,
    customer: profile
  });
}
