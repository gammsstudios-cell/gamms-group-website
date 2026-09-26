import { clearSellerCookie } from "../../_lib/sellerAuth.js";
import { json } from "../../_lib/responses.js";

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
