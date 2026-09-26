import { hashQrToken, isValidTokenFormat, normalizeToken } from "./crypto.js";

const STATUS_CODES = {
  used: "QR_ALREADY_USED",
  disabled: "QR_DISABLED"
};

export async function lookupQrByToken(db, token) {
  const normalized = normalizeToken(token);

  if (!isValidTokenFormat(normalized)) {
    return { ok: false, code: "QR_INVALID" };
  }

  const tokenHash = await hashQrToken(normalized);
  const row = await db
    .prepare(
      `SELECT
         q.public_number,
         q.status,
         q.product_id,
         p.id AS product_id,
         p.name AS product_name
       FROM qr_codes q
       LEFT JOIN products p ON p.id = q.product_id
       WHERE q.token_hash = ?
       LIMIT 1`
    )
    .bind(tokenHash)
    .first();

  if (!row) {
    return { ok: false, code: "QR_INVALID" };
  }

  if (row.status !== "available") {
    return {
      ok: false,
      code: STATUS_CODES[row.status] ?? "QR_INVALID"
    };
  }

  return {
    ok: true,
    qr: {
      number: row.public_number,
      status: row.status
    },
    product: row.product_id
      ? {
          id: row.product_id,
          name: row.product_name
        }
      : null
  };
}
