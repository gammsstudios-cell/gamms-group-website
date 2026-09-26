import { registerPurchase, sanitizePurchaseError } from "../_lib/purchases.js";
import { json, safeError } from "../_lib/responses.js";

export async function onRequestPost(context) {
  let body;

  try {
    body = await context.request.json();
  } catch {
    return safeError("QR_INVALID", 400);
  }

  try {
    const result = await registerPurchase(context.env.DB, context.request, body?.token);
    const headers = result.customerCookie ? { "set-cookie": result.customerCookie } : {};

    if (!result.ok) {
      if (result.code === "REWARD_REQUIRES_SELLER") {
        return json(
          {
            ok: false,
            code: result.code,
            reward: {
              type: result.reward.type,
              discountPercent: result.reward.discountPercent
            }
          },
          { headers }
        );
      }

      return safeError(sanitizePurchaseError(result.code), 200, headers);
    }

    return json(
      {
        ok: true,
        purchase: result.purchase,
        progress: result.progress
      },
      { headers }
    );
  } catch {
    return safeError("INTERNAL_ERROR", 500);
  }
}
