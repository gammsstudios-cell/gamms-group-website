import { sha256Hex } from "./crypto.js";
import { buildCustomerCookie, getCustomerIdFromRequest } from "./cookies.js";
import { formatFriendlyCustomerId } from "./customerProfile.js";
import { renderQrSvg } from "./qrSvg.js";

export const CUSTOMER_IDENTITY_PREFIX = "GAMMS-AEP-CUSTOMER:";

export function generateCustomerIdentityToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeCustomerIdentityToken(value) {
  const raw = String(value ?? "").trim();
  return raw.startsWith(CUSTOMER_IDENTITY_PREFIX) ? raw.slice(CUSTOMER_IDENTITY_PREFIX.length).trim() : raw;
}

export async function hashCustomerIdentityToken(value) {
  return sha256Hex(normalizeCustomerIdentityToken(value));
}

function publicIdentity(customer, token = null) {
  const payload = token ? `${CUSTOMER_IDENTITY_PREFIX}${token}` : null;
  return {
    customer: {
      id: customer.id,
      displayName: customer.display_name || null,
      customerLabel: formatFriendlyCustomerId(customer.id)
    },
    token: token ? payload : undefined,
    qrSvg: payload ? renderQrSvg(payload) : undefined
  };
}

export async function ensureCustomerIdentityToken(db, customerId, options = {}) {
  const existing = await db.prepare(
    `SELECT c.id, c.display_name, t.id AS token_id
     FROM customers c
     LEFT JOIN customer_identity_tokens t ON t.customer_id = c.id AND t.active = 1
     WHERE c.id = ?
     LIMIT 1`
  ).bind(customerId).first();

  if (!existing) return { ok: false, code: "CUSTOMER_NOT_FOUND" };
  if (existing.token_id && options.rotate !== true) {
    return {
      ok: true,
      alreadyIssued: true,
      identity: publicIdentity(existing)
    };
  }

  const token = options.generateToken?.() ?? generateCustomerIdentityToken();
  const tokenHash = await hashCustomerIdentityToken(token);

  await db.batch([
    db.prepare(
      `UPDATE customer_identity_tokens
       SET active = 0, revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), rotated_at = CURRENT_TIMESTAMP
       WHERE customer_id = ? AND active = 1`
    ).bind(customerId),
    db.prepare(
      `INSERT INTO customer_identity_tokens (customer_id, token_hash, active, created_at)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)`
    ).bind(customerId, tokenHash)
  ]);

  return { ok: true, identity: publicIdentity(existing, token) };
}

export async function resolveCustomerIdentityToken(db, rawToken, request, options = {}) {
  const token = normalizeCustomerIdentityToken(rawToken);
  if (!/^[a-f0-9]{64}$/i.test(token)) return { ok: false, code: "CUSTOMER_TOKEN_INVALID" };

  const tokenHash = await hashCustomerIdentityToken(token);
  const row = await db.prepare(
    `SELECT c.id, c.display_name
     FROM customer_identity_tokens t
     JOIN customers c ON c.id = t.customer_id
     WHERE t.token_hash = ? AND t.active = 1
     LIMIT 1`
  ).bind(tokenHash).first();

  if (!row) return { ok: false, code: "CUSTOMER_TOKEN_INVALID" };

  const currentCustomerId = getCustomerIdFromRequest(request);
  if (currentCustomerId && currentCustomerId !== row.id && options.confirmSwitch !== true) {
    const current = await db.prepare(
      "SELECT id, display_name FROM customers WHERE id = ? LIMIT 1"
    ).bind(currentCustomerId).first();

    return {
      ok: false,
      code: "IDENTITY_SWITCH_CONFIRMATION_REQUIRED",
      currentCustomer: current ? {
        id: current.id,
        displayName: current.display_name || null,
        customerLabel: formatFriendlyCustomerId(current.id)
      } : {
        id: currentCustomerId,
        displayName: null,
        customerLabel: formatFriendlyCustomerId(currentCustomerId)
      },
      targetCustomer: {
        id: row.id,
        displayName: row.display_name || null,
        customerLabel: formatFriendlyCustomerId(row.id)
      }
    };
  }

  await db.prepare("UPDATE customers SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();

  return {
    ok: true,
    cookie: buildCustomerCookie(row.id, request),
    customer: {
      id: row.id,
      displayName: row.display_name || null,
      customerLabel: formatFriendlyCustomerId(row.id)
    }
  };
}

export async function revokeCustomerIdentityToken(db, customerId) {
  await db.prepare(
    `UPDATE customer_identity_tokens
     SET active = 0, revoked_at = CURRENT_TIMESTAMP
     WHERE customer_id = ? AND active = 1`
  ).bind(customerId).run();
  return { ok: true };
}
