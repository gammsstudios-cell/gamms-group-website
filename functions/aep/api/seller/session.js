import { clearSellerCookie, requireSellerAuth } from "../../_lib/sellerAuth.js";
import { json } from "../../_lib/responses.js";

export async function onRequestGet(context) {
  const auth = await requireSellerAuth(context.request, context.env);

  return json({
    authenticated: auth.ok === true
  });
}

export async function onRequestPost(context) {
  return json(
    {
      ok: true,
      authenticated: false
    },
    {
      headers: {
        "set-cookie": clearSellerCookie(context.request)
      }
    }
  );
}
