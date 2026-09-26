import { createSellerSession, buildSellerCookie, loginSeller } from "../../_lib/sellerAuth.js";
import { json, safeError } from "../../_lib/responses.js";

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return safeError("SELLER_AUTH_INVALID", 401);
  }

  const result = await loginSeller(context.env, body?.passcode);
  if (!result.ok) {
    return safeError(result.code, result.status);
  }

  const session = await createSellerSession(context.env);
  return json(
    {
      ok: true,
      authenticated: true
    },
    {
      headers: {
        "set-cookie": buildSellerCookie(session, context.request)
      }
    }
  );
}
