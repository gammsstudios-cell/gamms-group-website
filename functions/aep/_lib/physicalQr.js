import { hashQrToken, isValidTokenFormat, normalizeToken } from "./crypto.js";

export function normalizePhysicalQrInput(rawInput) {
  const raw = String(rawInput ?? "").trim();
  if (!raw) return { type: "invalid", value: "" };

  let value = raw;
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const promoIndex = parts.findIndex((part) => part === "promo");
    if (promoIndex >= 0 && parts[promoIndex + 1] === "r" && parts[promoIndex + 2]) {
      const routeToken = normalizeToken(parts[promoIndex + 2]).replace(/^GAMMS-AEP-QR:/i, "").trim();
      if (isValidTokenFormat(routeToken)) {
        return { type: "token", value: routeToken };
      }
      value = parts[promoIndex + 2];
    }
  } catch {}

  const prefixedToken = normalizeToken(value).replace(/^GAMMS-AEP-QR:/i, "").trim();
  if (/^GAMMS-AEP-QR:/i.test(value) && isValidTokenFormat(prefixedToken)) {
    return { type: "token", value: prefixedToken };
  }

  const publicNumberText = value.replace(/^#/, "").trim();
  if (/^[1-9][0-9]*$/.test(publicNumberText)) {
    return { type: "publicNumber", value: Number(publicNumberText) };
  }

  if (isValidTokenFormat(prefixedToken)) {
    return { type: "token", value: prefixedToken };
  }

  return { type: "invalid", value };
}

function classifyResolvedQr(row) {
  if (!row) return "QR_INVALID";
  if (row.status === "used") return "QR_ALREADY_USED";
  if (row.status === "disabled") return "QR_DISABLED";
  if (!row.product_id || !row.valid_product_id) return "PRODUCT_NOT_FOUND";
  if (Number(row.stock_quantity || 0) <= 0) return "OUT_OF_STOCK";
  if (row.status !== "available") return "QR_INVALID";
  return null;
}

function publicResolvedQr(row, token = null) {
  return {
    id: row.id,
    publicNumber: row.public_number,
    tokenHash: row.token_hash,
    token,
    status: row.status,
    productId: row.product_id,
    product: {
      id: row.product_id,
      name: row.product_name,
      priceCents: row.price_cents,
      stockQuantity: row.stock_quantity
    }
  };
}

export async function resolvePhysicalQrInput(db, rawInput) {
  const normalized = normalizePhysicalQrInput(rawInput);
  if (normalized.type === "invalid") return { ok: false, code: "QR_INVALID" };

  let row;
  let token = null;

  if (normalized.type === "publicNumber") {
    row = await db.prepare(
      `SELECT q.id, q.public_number, q.token_hash, q.product_id, q.status,
              p.id AS valid_product_id, p.name AS product_name, p.price_cents,
              COALESCE(p.stock_quantity, 0) AS stock_quantity
       FROM qr_codes q
       LEFT JOIN products p ON p.id = q.product_id AND p.active = 1
       WHERE q.public_number = ?
       LIMIT 1`
    ).bind(normalized.value).first();
  } else {
    token = normalized.value;
    const tokenHash = await hashQrToken(token);
    row = await db.prepare(
      `SELECT q.id, q.public_number, q.token_hash, q.product_id, q.status,
              p.id AS valid_product_id, p.name AS product_name, p.price_cents,
              COALESCE(p.stock_quantity, 0) AS stock_quantity
       FROM qr_codes q
       LEFT JOIN products p ON p.id = q.product_id AND p.active = 1
       WHERE q.token_hash = ?
       LIMIT 1`
    ).bind(tokenHash).first();
  }

  const failure = classifyResolvedQr(row);
  if (failure) return { ok: false, code: failure };
  return { ok: true, qr: publicResolvedQr(row, token) };
}
