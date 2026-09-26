import { calculateProgress } from "./progress.js";
import { hashClaimCode, isValidClaimCode, normalizeClaimCode } from "./claims.js";

const EXPECTED_REDEMPTION_ERRORS = new Set([
  "CLAIM_INVALID",
  "CLAIM_EXPIRED",
  "CLAIM_ALREADY_REDEEMED",
  "CLAIM_CONFLICT",
  "QR_INVALID",
  "QR_ALREADY_USED",
  "QR_DISABLED",
  "REWARD_NOT_AVAILABLE",
  "REDEMPTION_CONFLICT"
]);

function finalPrice(regularPriceCents, discountPercent) {
  return Math.round(Number(regularPriceCents) * (100 - Number(discountPercent)) / 100);
}

function firstRow(result) {
  return Array.isArray(result?.results) ? result.results[0] : null;
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

async function classifyClaimFailure(db, claimHash) {
  const claim = await db
    .prepare(
      `SELECT
         c.status AS claim_status,
         c.expires_at AS expires_at,
         c.expires_at <= CURRENT_TIMESTAMP AS expired,
         q.status AS qr_status,
         r.status AS reward_status
       FROM reward_claims c
       LEFT JOIN qr_codes q ON q.id = c.qr_code_id
       LEFT JOIN rewards r ON r.id = c.reward_id
       WHERE c.token_hash = ?
       LIMIT 1`
    )
    .bind(claimHash)
    .first();

  if (!claim) return "CLAIM_INVALID";
  if (claim.claim_status === "redeemed") return "CLAIM_ALREADY_REDEEMED";
  if (claim.claim_status === "expired" || claim.expired) return "CLAIM_EXPIRED";
  if (claim.claim_status !== "available") return "CLAIM_CONFLICT";
  if (claim.reward_status !== "available") return "REWARD_NOT_AVAILABLE";
  if (claim.qr_status === "used") return "QR_ALREADY_USED";
  if (claim.qr_status === "disabled") return "QR_DISABLED";

  return "CLAIM_INVALID";
}

export async function previewClaim(db, rawCode) {
  const code = normalizeClaimCode(rawCode);
  if (!isValidClaimCode(code)) return { ok: false, code: "CLAIM_INVALID" };

  const claimHash = await hashClaimCode(code);
  const row = await db
    .prepare(
      `SELECT
         c.status AS claim_status,
         c.expires_at AS expires_at,
         c.expires_at <= CURRENT_TIMESTAMP AS expired,
         q.status AS qr_status,
         q.public_number AS public_number,
         p.name AS product_name,
         p.price_cents AS price_cents,
         r.status AS reward_status,
         r.discount_percent AS discount_percent
       FROM reward_claims c
       JOIN rewards r ON r.id = c.reward_id
       JOIN qr_codes q ON q.id = c.qr_code_id
       JOIN products p ON p.id = q.product_id AND p.active = 1
       WHERE c.token_hash = ?
       LIMIT 1`
    )
    .bind(claimHash)
    .first();

  if (!row) return { ok: false, code: "CLAIM_INVALID" };
  if (row.claim_status === "redeemed") return { ok: false, code: "CLAIM_ALREADY_REDEEMED" };
  if (row.claim_status === "expired" || row.expired) return { ok: false, code: "CLAIM_EXPIRED" };
  if (row.claim_status !== "available") return { ok: false, code: "CLAIM_CONFLICT" };
  if (row.reward_status !== "available") return { ok: false, code: "REWARD_NOT_AVAILABLE" };
  if (row.qr_status === "used") return { ok: false, code: "QR_ALREADY_USED" };
  if (row.qr_status === "disabled") return { ok: false, code: "QR_DISABLED" };

  return {
    ok: true,
    claim: {
      status: "available",
      expiresAt: row.expires_at
    },
    qr: {
      number: row.public_number
    },
    product: {
      name: row.product_name
    },
    pricing: {
      regularPriceCents: row.price_cents,
      discountPercent: row.discount_percent,
      finalPriceCents: finalPrice(row.price_cents, row.discount_percent)
    }
  };
}

export async function redeemClaim(db, rawCode) {
  const code = normalizeClaimCode(rawCode);
  if (!isValidClaimCode(code)) return { ok: false, code: "CLAIM_INVALID" };

  const claimHash = await hashClaimCode(code);

  try {
    const [insertResult, qrResult, rewardResult, claimResult] = await db.batch([
      db
        .prepare(
          `INSERT INTO purchases (
             customer_id,
             product_id,
             qr_code_id,
             regular_price_cents,
             discount_percent,
             final_price_cents
           )
           SELECT
             c.customer_id,
             p.id,
             q.id,
             p.price_cents,
             r.discount_percent,
             ROUND(p.price_cents * (100 - r.discount_percent) / 100.0)
           FROM reward_claims c
           JOIN rewards r ON r.id = c.reward_id AND r.status = 'available'
           JOIN qr_codes q ON q.id = c.qr_code_id AND q.status = 'available'
           JOIN products p ON p.id = q.product_id AND p.active = 1
           WHERE c.token_hash = ?
             AND c.status = 'available'
             AND c.expires_at > CURRENT_TIMESTAMP
           RETURNING
             id,
             customer_id,
             product_id,
             qr_code_id,
             regular_price_cents,
             discount_percent,
             final_price_cents`
        )
        .bind(claimHash),
      db
        .prepare(
          `UPDATE qr_codes
           SET status = 'used',
               used_at = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT c.qr_code_id
             FROM reward_claims c
             JOIN purchases p ON p.qr_code_id = c.qr_code_id
             WHERE c.token_hash = ?
             LIMIT 1
           )
             AND status = 'available'
           RETURNING public_number`
        )
        .bind(claimHash),
      db
        .prepare(
          `UPDATE rewards
           SET status = 'redeemed',
               redeemed_at = CURRENT_TIMESTAMP,
               redeemed_purchase_id = (
                 SELECT p.id
                 FROM reward_claims c
                 JOIN purchases p ON p.qr_code_id = c.qr_code_id
                 WHERE c.token_hash = ?
                 LIMIT 1
               )
           WHERE id = (
             SELECT reward_id
             FROM reward_claims
             WHERE token_hash = ?
           )
             AND status = 'available'
           RETURNING status, cycle_number`
        )
        .bind(claimHash, claimHash),
      db
        .prepare(
          `UPDATE reward_claims
           SET status = 'redeemed',
               redeemed_at = CURRENT_TIMESTAMP,
               redeemed_purchase_id = (
                 SELECT p.id
                 FROM purchases p
                 WHERE p.qr_code_id = reward_claims.qr_code_id
                 LIMIT 1
               )
           WHERE token_hash = ?
             AND status = 'available'
           RETURNING status`
        )
        .bind(claimHash)
    ]);

    const purchase = firstRow(insertResult);
    if (!purchase || changes(insertResult) !== 1) return { ok: false, code: await classifyClaimFailure(db, claimHash) };

    const qr = firstRow(qrResult);
    const reward = firstRow(rewardResult);
    const claim = firstRow(claimResult);
    if (
      changes(qrResult) !== 1 ||
      changes(rewardResult) !== 1 ||
      changes(claimResult) !== 1 ||
      !qr ||
      !reward ||
      !claim
    ) {
      return { ok: false, code: "REDEMPTION_CONFLICT" };
    }

    const product = await db
      .prepare("SELECT name FROM products WHERE id = ? LIMIT 1")
      .bind(purchase.product_id)
      .first();
    const countRow = await db
      .prepare("SELECT COUNT(*) AS purchase_count FROM purchases WHERE customer_id = ?")
      .bind(purchase.customer_id)
      .first();

    return {
      ok: true,
      purchase: {
        qrNumber: qr.public_number,
        product: {
          name: product?.name
        },
        regularPriceCents: purchase.regular_price_cents,
        discountPercent: purchase.discount_percent,
        finalPriceCents: purchase.final_price_cents
      },
      reward: {
        status: reward.status,
        cycleNumber: reward.cycle_number
      },
      progress: calculateProgress(countRow?.purchase_count ?? 0)
    };
  } catch {
    return { ok: false, code: "REDEMPTION_CONFLICT" };
  }
}

export function sanitizeRedemptionError(error) {
  return EXPECTED_REDEMPTION_ERRORS.has(error) ? error : "INTERNAL_ERROR";
}
