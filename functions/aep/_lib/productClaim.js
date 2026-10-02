import {
  CLAIM_PREFIX,
  formatClaimCode,
  generateClaimCode,
  hashClaimCode
} from "./claims.js";
import { getCustomerIdFromRequest } from "./cookies.js";
import { formatFriendlyCustomerId } from "./customerProfile.js";
import { requireEventActive } from "./eventGate.js";
import { renderQrSvg } from "./qrSvg.js";

function firstRow(result) {
  return Array.isArray(result?.results) ? result.results[0] : null;
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export async function createRewardClaimForProduct(db, request, productId, options = {}) {
  const event = await requireEventActive(db);
  if (!event.ok) return { ok: false, code: event.code };

  const normalizedProductId = Number.parseInt(productId, 10);
  if (!Number.isInteger(normalizedProductId) || normalizedProductId < 1) {
    return { ok: false, code: "REWARD_NOT_AVAILABLE" };
  }

  const customerId = getCustomerIdFromRequest(request);
  if (!customerId) return { ok: false, code: "CLAIM_INVALID" };

  const preview = await db.prepare(
    `SELECT r.id AS reward_id,
            r.discount_percent,
            r.cycle_number,
            r.product_id,
            p.name AS product_name,
            c.display_name
     FROM rewards r
     JOIN customers c ON c.id = r.customer_id
     LEFT JOIN products p ON p.id = ?
     WHERE r.customer_id = ?
       AND r.status = 'available'
       AND (
         r.product_id = ?
         OR (r.product_id IS NULL AND r.reward_type = 'third_drink_50')
       )
     ORDER BY r.product_id IS NULL ASC, r.cycle_number ASC
     LIMIT 1`
  ).bind(normalizedProductId, customerId, normalizedProductId).first();

  if (!preview) return { ok: false, code: "REWARD_NOT_AVAILABLE" };

  const code = options.generateClaimCode?.() ?? generateClaimCode();
  const codeHash = await hashClaimCode(code);

  try {
    const [, , insertResult] = await db.batch([
      db.prepare(
        `UPDATE reward_claims
         SET status = 'expired'
         WHERE status = 'available'
           AND expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
      ),
      db.prepare(
        `UPDATE reward_claims
         SET status = 'cancelled'
         WHERE status = 'available'
           AND reward_id = ?`
      ).bind(preview.reward_id),
      db.prepare(
        `INSERT INTO reward_claims (
           reward_id, customer_id, qr_code_id, token_hash, status, expires_at
         )
         SELECT
           r.id, ?, NULL, ?, 'available', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+5 minutes')
         FROM rewards r
         WHERE r.id = ?
           AND r.customer_id = ?
           AND r.status = 'available'
           AND (
             r.product_id = ?
             OR (r.product_id IS NULL AND r.reward_type = 'third_drink_50')
           )
         RETURNING expires_at`
      ).bind(customerId, codeHash, preview.reward_id, customerId, normalizedProductId)
    ]);

    const inserted = firstRow(insertResult);
    if (!inserted || changes(insertResult) !== 1) {
      return { ok: false, code: "REWARD_NOT_AVAILABLE" };
    }

    const formattedCode = formatClaimCode(code);
    return {
      ok: true,
      claim: {
        code: formattedCode,
        qrSvg: renderQrSvg(`${CLAIM_PREFIX}${code.replace(/[\s-]+/g, "").toUpperCase()}`),
        expiresAt: inserted.expires_at,
        qrNumber: null,
        product: preview.product_name ? { id: normalizedProductId, name: preview.product_name } : null,
        discountPercent: Number(preview.discount_percent),
        customer: {
          displayName: preview.display_name || null,
          customerLabel: formatFriendlyCustomerId(customerId)
        }
      }
    };
  } catch {
    return { ok: false, code: "REWARD_NOT_AVAILABLE" };
  }
}

export async function createRewardClaimForReward(db, request, rewardId, options = {}) {
  const event = await requireEventActive(db);
  if (!event.ok) return { ok: false, code: event.code };

  const normalizedRewardId = Number.parseInt(rewardId, 10);
  if (!Number.isInteger(normalizedRewardId) || normalizedRewardId < 1) {
    return { ok: false, code: "REWARD_NOT_AVAILABLE" };
  }

  const customerId = getCustomerIdFromRequest(request);
  if (!customerId) return { ok: false, code: "CLAIM_INVALID" };

  const preview = await db.prepare(
    `SELECT r.id AS reward_id,
            r.discount_percent,
            r.cycle_number,
            r.product_id,
            p.name AS product_name,
            c.display_name
     FROM rewards r
     JOIN customers c ON c.id = r.customer_id
     LEFT JOIN products p ON p.id = r.product_id
     WHERE r.id = ?
       AND r.customer_id = ?
       AND r.status = 'available'
     LIMIT 1`
  ).bind(normalizedRewardId, customerId).first();

  if (!preview) return { ok: false, code: "REWARD_NOT_AVAILABLE" };

  const code = options.generateClaimCode?.() ?? generateClaimCode();
  const codeHash = await hashClaimCode(code);

  try {
    const [, , insertResult] = await db.batch([
      db.prepare(
        `UPDATE reward_claims
         SET status = 'expired'
         WHERE status = 'available'
           AND expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
      ),
      db.prepare(
        `UPDATE reward_claims
         SET status = 'cancelled'
         WHERE status = 'available'
           AND reward_id = ?`
      ).bind(preview.reward_id),
      db.prepare(
        `INSERT INTO reward_claims (
           reward_id, customer_id, qr_code_id, token_hash, status, expires_at
         )
         SELECT
           r.id, ?, NULL, ?, 'available', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+5 minutes')
         FROM rewards r
         WHERE r.id = ?
           AND r.customer_id = ?
           AND r.status = 'available'
         RETURNING expires_at`
      ).bind(customerId, codeHash, preview.reward_id, customerId)
    ]);

    const inserted = firstRow(insertResult);
    if (!inserted || changes(insertResult) !== 1) return { ok: false, code: "REWARD_NOT_AVAILABLE" };

    const normalizedCode = code.replace(/[\s-]+/g, "").toUpperCase();
    return {
      ok: true,
      claim: {
        code: formatClaimCode(normalizedCode),
        qrSvg: renderQrSvg(`${CLAIM_PREFIX}${normalizedCode}`),
        expiresAt: inserted.expires_at,
        qrNumber: null,
        product: preview.product_name ? { id: preview.product_id, name: preview.product_name } : null,
        discountPercent: Number(preview.discount_percent),
        customer: {
          displayName: preview.display_name || null,
          customerLabel: formatFriendlyCustomerId(customerId)
        }
      }
    };
  } catch {
    return { ok: false, code: "REWARD_NOT_AVAILABLE" };
  }
}
