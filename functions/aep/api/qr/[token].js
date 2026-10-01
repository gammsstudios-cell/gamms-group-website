import { lookupQrByToken } from "../../_lib/qr.js";
import { json, safeError } from "../../_lib/responses.js";
import { requireEventActive } from "../../_lib/eventGate.js";

export async function onRequestGet(context) {
  try {
    if (!context.env.DB) {
      return safeError("DATABASE_UNAVAILABLE", 500);
    }

    const event = await requireEventActive(context.env.DB);
    if (!event.ok) return safeError(event.code, 200);

    const result = await lookupQrByToken(context.env.DB, context.params.token);
    return json(result);
  } catch {
    return safeError("QR_LOOKUP_FAILED", 500);
  }
}
