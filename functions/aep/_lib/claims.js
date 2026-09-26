import { hashQrToken, sha256Hex } from "./crypto.js";
import { getCustomerIdFromRequest } from "./cookies.js";
import { renderQrSvg } from "./qrSvg.js";

export const CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CLAIM_CODE_LENGTH = 10;
export const CLAIM_TTL_SECONDS = 300;
export const CLAIM_PREFIX = "GAMMS-AEP-CLAIM:";

export function normalizeClaimCode(code) {
  return String(code ?? "").replace(/[\s-]+/g, "").toUpperCase();
}

export function isValidClaimCode(code) {
  const normalized = normalizeClaimCode(code);
  return normalized.length === CLAIM_CODE_LENGTH &&
    [...normalized].every((char) => CLAIM_ALPHABET.includes(char));
}

export function formatClaimCode(code) {
  const normalized = normalizeClaimCode(code);
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8)}`;
}

export function generateClaimCode() {
  const output = [];
  const max = Math.floor(256 / CLAIM_ALPHABET.length) * CLAIM_ALPHABET.length;

  while (output.length < CLAIM_CODE_LENGTH) {
    const bytes = new Uint8Array(CLAIM_CODE_LENGTH - output.length);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= max) continue;
      output.push(CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length]);
      if (output.length === CLAIM_CODE_LENGTH) break;
    }
  }

  return output.join("");
}

export async function hashClaimCode(code) {
  const normalized = normalizeClaimCode(code);
  if (!isValidClaimCode(normalized)) throw new TypeError("Invalid claim code format.");

  return sha256Hex(normalized);
}

function publicClaim(row, code) {
  const normalized = normalizeClaimCode(code);

  return {
    code: formatClaimCode(normalized),
    qrSvg: renderQrSvg(`${CLAIM_PREFIX}${normalized}`),
    expiresAt: row.expires_at,
    qrNumber: row.public_number,
    product: {
      name: row.product_name
    },
    discountPercent: row.discount_percent
  };
}

function firstRow(result) {
  return Array.isArray(result?.results) ? result.results[0] : null;
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export async function createRewardClaim(db, request, qrToken, options = {}) {
  const customerId = getCustomerIdFromRequest(request);
  if (!customerId) return { ok: false, code: "CLAIM_INVALID" };

  const customer = await db
    .prepare("SELECT id FROM customers WHERE id = ? LIMIT 1")
    .bind(customerId)
    .first();
  if (!customer) return { ok: false, code: "CLAIM_INVALID" };

  let qrTokenHash;
  try {
    qrTokenHash = await hashQrToken(qrToken);
  } catch {
    return { ok: false, code: "QR_INVALID" };
  }

  const code = options.generateClaimCode?.() ?? generateClaimCode();
  const codeHash = await hashClaimCode(code);

  const preview = await db
    .prepare(
      `SELECT
         r.id AS reward_id,
         r.discount_percent AS discount_percent,
         r.cycle_number AS cycle_number,
         q.id AS qr_code_id,
         q.public_number AS public_number,
         p.name AS product_name
       FROM rewards r
       JOIN qr_codes q ON q.token_hash = ? AND q.status = 'available'
       JOIN products p ON p.id = q.product_id AND p.active = 1
       WHERE r.customer_id = ?
         AND r.reward_type = 'third_drink_50'
         AND r.status = 'available'
         AND r.cycle_number = (
           SELECT CAST(((COUNT(*) - 1) / 3) + 1 AS INTEGER)
           FROM purchases
           WHERE customer_id = ?
         )
       ORDER BY r.cycle_number ASC
       LIMIT 1`
    )
    .bind(qrTokenHash, customerId, customerId)
    .first();

  if (!preview) return { ok: false, code: "REWARD_NOT_AVAILABLE" };

  try {
    const [, , insertResult] = await db.batch([
      db
        .prepare(
          `UPDATE reward_claims
           SET status = 'expired'
           WHERE status = 'available'
             AND expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
        ),
      db
        .prepare(
          `UPDATE reward_claims
           SET status = 'cancelled'
           WHERE status = 'available'
             AND (reward_id = ? OR qr_code_id = ?)`
        )
        .bind(preview.reward_id, preview.qr_code_id),
      db
        .prepare(
          `INSERT INTO reward_claims (
             reward_id,
             customer_id,
             qr_code_id,
             token_hash,
             status,
             expires_at
           )
           SELECT
             r.id,
             ?,
             q.id,
             ?,
             'available',
             strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+5 minutes')
           FROM rewards r
           JOIN qr_codes q ON q.token_hash = ?
             AND q.status = 'available'
           JOIN products p ON p.id = q.product_id
             AND p.active = 1
           WHERE r.customer_id = ?
             AND r.reward_type = 'third_drink_50'
             AND r.status = 'available'
             AND r.cycle_number = (
               SELECT CAST(((COUNT(*) - 1) / 3) + 1 AS INTEGER)
               FROM purchases
               WHERE customer_id = ?
             )
           RETURNING
             expires_at,
             reward_id,
             qr_code_id`
        )
        .bind(customerId, codeHash, qrTokenHash, customerId, customerId)
    ]);
    const claimRow = firstRow(insertResult);
    if (changes(insertResult) !== 1 || !claimRow) {
      return { ok: false, code: "REWARD_NOT_AVAILABLE" };
    }
    const details = await db
      .prepare(
        `SELECT
           r.discount_percent AS discount_percent,
           r.cycle_number AS cycle_number,
           q.public_number AS public_number,
           p.name AS product_name
         FROM reward_claims c
         JOIN rewards r ON r.id = c.reward_id
         JOIN qr_codes q ON q.id = c.qr_code_id
         JOIN products p ON p.id = q.product_id
         WHERE c.token_hash = ?
         LIMIT 1`
      )
      .bind(codeHash)
      .first();

    return {
      ok: true,
      claim: publicClaim({ ...details, ...claimRow }, code)
    };
  } catch {
    return { ok: false, code: "CLAIM_CONFLICT" };
  }
}
