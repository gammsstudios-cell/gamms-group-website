import { resolveCustomerIdentityToken } from "../../_lib/customerIdentity.js";
import { jsonResponse, errorJson } from "../../_lib/adminResponses.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("INVALID_JSON", 400);
  }

  const result = await resolveCustomerIdentityToken(env.DB, body?.token, request, {
    confirmSwitch: body?.confirmSwitch === true
  });
  if (!result.ok) {
    const extra = {};
    if (result.code === "IDENTITY_SWITCH_CONFIRMATION_REQUIRED") {
      extra.currentCustomer = result.currentCustomer;
      extra.targetCustomer = result.targetCustomer;
    }
    return errorJson(result.code, 409, extra);
  }

  const headers = new Headers();
  headers.set("Set-Cookie", result.cookie);

  return jsonResponse({ ok: true, customer: result.customer }, { headers });
}
