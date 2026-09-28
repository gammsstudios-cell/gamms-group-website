import { calculateProgress } from "./progress.js";
import { hashClaimCode, isValidClaimCode, normalizeClaimCode } from "./claims.js";
import { formatFriendlyCustomerId } from "./customerProfile.js";
import { recordPurchaseAttribution } from "./purchaseAttribution.js";
import { requireEventActive } from "./eventGate.js";
import { resolvePhysicalQrInput } from "./physicalQr.js";

const EXPECTED_REDEMPTION_ERRORS = new Set([
  "CLAIM_INVALID",
  "CLAIM_EXPIRED",
  "CLAIM_ALREADY_REDEEMED",
  "CLAIM_CONFLICT",
  "QR_INVALID",
  "QR_ALREADY_USED",
  "QR_DISABLED",
  "REWARD_NOT_AVAILABLE",
  "OUT_OF_STOCK",
  "REDEMPTION_CONFLICT",
  "EVENT_CLOSED",
  "SHIFT_REQUIRED"
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
         r.status AS reward_status,
         COALESCE(p.stock_quantity, 0) AS stock_quantity
       FROM reward_claims c
       LEFT JOIN qr_codes q ON q.id = c.qr_code_id
       LEFT JOIN products p ON p.id = q.product_id
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
  if (claim.stock_quantity <= 0) return "OUT_OF_STOCK";

  return "CLAIM_INVALID";
}

/**
 * POS Step 1 Scan: Previews customer reward claim status.
 */
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
         COALESCE(p.stock_quantity, 0) AS stock_quantity,
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

  if (!row) {
    // Check V2 claim (without pre-linked QR)
    const v2Row = await db
      .prepare(
        `SELECT
           c.id AS claim_id, c.status AS claim_status, c.expires_at AS expires_at,
           c.expires_at <= CURRENT_TIMESTAMP AS expired, c.customer_id,
           r.status AS reward_status, r.discount_percent, r.cycle_number, r.product_id
         FROM reward_claims c
         JOIN rewards r ON r.id = c.reward_id
         WHERE c.token_hash = ?
         LIMIT 1`
      )
      .bind(claimHash)
      .first();

    if (!v2Row) return { ok: false, code: "CLAIM_INVALID" };
    if (v2Row.claim_status === "redeemed") return { ok: false, code: "CLAIM_ALREADY_REDEEMED" };
    if (v2Row.claim_status === "expired" || v2Row.expired) return { ok: false, code: "CLAIM_EXPIRED" };
    if (v2Row.claim_status !== "available") return { ok: false, code: "CLAIM_CONFLICT" };
    if (v2Row.reward_status !== "available") return { ok: false, code: "REWARD_NOT_AVAILABLE" };

    const cust = await db.prepare("SELECT display_name FROM customers WHERE id = ?").bind(v2Row.customer_id).first();

    return {
      ok: true,
      claim: { id: v2Row.claim_id, status: "available", expiresAt: v2Row.expires_at, code },
      customer: { displayName: cust?.display_name || null, customerLabel: formatFriendlyCustomerId(v2Row.customer_id) },
      reward: { discountPercent: v2Row.discount_percent, cycleNumber: v2Row.cycle_number, productId: v2Row.product_id || null },
      preLinkedQr: null
    };
  }

  if (row.claim_status === "redeemed") return { ok: false, code: "CLAIM_ALREADY_REDEEMED" };
  if (row.claim_status === "expired" || row.expired) return { ok: false, code: "CLAIM_EXPIRED" };
  if (row.claim_status !== "available") return { ok: false, code: "CLAIM_CONFLICT" };
  if (row.reward_status !== "available") return { ok: false, code: "REWARD_NOT_AVAILABLE" };
  if (row.qr_status === "used") return { ok: false, code: "QR_ALREADY_USED" };
  if (row.qr_status === "disabled") return { ok: false, code: "QR_DISABLED" };
  if (row.stock_quantity <= 0) return { ok: false, code: "OUT_OF_STOCK" };

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

/**
 * POS Step 2 Scan: Previews product pricing when physical 3rd drink QR is scanned.
 */
export async function previewClaimProduct(db, rawCode, physicalQrToken) {
  const event = await requireEventActive(db);
  if (!event.ok) return { ok: false, code: event.code };

  const claimPrev = await previewClaim(db, rawCode);
  if (!claimPrev.ok) return claimPrev;

  const resolved = await resolvePhysicalQrInput(db, physicalQrToken);
  if (!resolved.ok) return { ok: false, code: resolved.code };
  const qr = resolved.qr;

  if (claimPrev.qr?.number && Number(claimPrev.qr.number) !== Number(qr.publicNumber)) {
    return { ok: false, code: "REWARD_NOT_AVAILABLE" };
  }
  if (claimPrev.reward?.productId && Number(claimPrev.reward.productId) !== Number(qr.productId)) {
    return { ok: false, code: "REWARD_NOT_AVAILABLE" };
  }

  const discountPercent = claimPrev.reward?.discountPercent || 50;
  const regularPriceCents = qr.product.priceCents;
  const finalPriceCents = finalPrice(regularPriceCents, discountPercent);

  return {
    ok: true,
    claim: claimPrev.claim,
    customer: claimPrev.customer,
    qr: { id: qr.id, publicNumber: qr.publicNumber, token: qr.token },
    product: { id: qr.productId, name: qr.product.name, stockQuantity: qr.product.stockQuantity },
    pricing: { regularPriceCents, discountPercent, finalPriceCents }
  };
}

/**
 * POS Step 3 Confirmation: Redeems reward claim.
 */
export async function redeemClaim(db, rawCode, options = {}) {
  const event = await requireEventActive(db);
  if (!event.ok) return { ok: false, code: event.code };

  const code = normalizeClaimCode(rawCode);
  if (!isValidClaimCode(code)) return { ok: false, code: "CLAIM_INVALID" };

  const claimHash = await hashClaimCode(code);

  const actorType = String(options.actorType ?? "seller").slice(0, 40);
  const actorIdentifier = String(options.actorIdentifier ?? actorType).slice(0, 120);
  const movementReason = String(options.movementReason ?? "Canje vendedor con descuento reward").slice(0, 240);

  let targetQrTokenHash = null;
  if (options.physicalQrToken) {
    const resolved = await resolvePhysicalQrInput(db, options.physicalQrToken);
    if (!resolved.ok) return { ok: false, code: resolved.code };
    targetQrTokenHash = resolved.qr.tokenHash;
  }

  try {
    let insertResult, qrResult, rewardResult, claimResult, stockResult, inventoryResult;

    if (targetQrTokenHash) {
      // Reward V2: Bind physical QR scanned by seller to claim during redemption
      [insertResult, qrResult, rewardResult, claimResult, stockResult, inventoryResult] = await db.batch([
        db.prepare(
          `INSERT INTO purchases (
             customer_id, product_id, qr_code_id, regular_price_cents, discount_percent, final_price_cents
           )
           SELECT
             c.customer_id, p.id, q.id, p.price_cents, r.discount_percent, ROUND(p.price_cents * (100 - r.discount_percent) / 100.0)
           FROM reward_claims c
           JOIN rewards r ON r.id = c.reward_id AND r.status = 'available'
           JOIN qr_codes q ON q.token_hash = ? AND q.status = 'available'
           JOIN products p ON p.id = q.product_id AND p.active = 1
           WHERE c.token_hash = ? AND c.status = 'available' AND c.expires_at > CURRENT_TIMESTAMP AND COALESCE(p.stock_quantity, 0) > 0
             AND (r.product_id IS NULL OR r.product_id = p.id)
           RETURNING id, customer_id, product_id, qr_code_id, regular_price_cents, discount_percent, final_price_cents`
        ).bind(targetQrTokenHash, claimHash),

        db.prepare(
          `UPDATE qr_codes SET status = 'used', used_at = CURRENT_TIMESTAMP
           WHERE token_hash = ? AND status = 'available'
             AND EXISTS (SELECT 1 FROM purchases WHERE purchases.qr_code_id = qr_codes.id)
           RETURNING public_number`
        ).bind(targetQrTokenHash),

        db.prepare(
          `UPDATE rewards SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP,
               redeemed_purchase_id = (SELECT id FROM purchases WHERE qr_code_id = (SELECT id FROM qr_codes WHERE token_hash = ?) LIMIT 1)
           WHERE id = (SELECT reward_id FROM reward_claims WHERE token_hash = ?) AND status = 'available'
           RETURNING status, cycle_number`
        ).bind(targetQrTokenHash, claimHash),

        db.prepare(
          `UPDATE reward_claims SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP,
               qr_code_id = (SELECT id FROM qr_codes WHERE token_hash = ?),
               redeemed_purchase_id = (SELECT id FROM purchases WHERE qr_code_id = (SELECT id FROM qr_codes WHERE token_hash = ?) LIMIT 1)
           WHERE token_hash = ? AND status = 'available'
           RETURNING status`
        ).bind(targetQrTokenHash, targetQrTokenHash, claimHash),

        db.prepare(
          `UPDATE products SET stock_quantity = stock_quantity - 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = (SELECT product_id FROM qr_codes WHERE token_hash = ?) AND stock_quantity > 0`
        ).bind(targetQrTokenHash),

        db.prepare(
          `INSERT INTO inventory_movements (product_id, movement_type, quantity_delta, reason, purchase_id, actor_type, actor_identifier, created_at)
           SELECT q.product_id, 'sale', -1, ?, p.id, ?, ?, CURRENT_TIMESTAMP
           FROM qr_codes q JOIN purchases p ON p.qr_code_id = q.id WHERE q.token_hash = ? LIMIT 1`
        ).bind(movementReason, actorType, actorIdentifier, targetQrTokenHash)
      ]);
    } else {
      // Legacy mode: Exact legacy query batch structure for pre-linked physical QR
      [insertResult, qrResult, rewardResult, claimResult, stockResult, inventoryResult] = await db.batch([
        db.prepare(
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
             AND COALESCE(p.stock_quantity, 0) > 0
           RETURNING
             id,
             customer_id,
             product_id,
             qr_code_id,
             regular_price_cents,
             discount_percent,
             final_price_cents`
        ).bind(claimHash),

        db.prepare(
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
        ).bind(claimHash),

        db.prepare(
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
             AND EXISTS (
               SELECT 1
               FROM reward_claims c
               JOIN purchases p ON p.qr_code_id = c.qr_code_id
               WHERE c.token_hash = ?
             )
           RETURNING status, cycle_number`
        ).bind(claimHash, claimHash, claimHash),

        db.prepare(
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
             AND EXISTS (
               SELECT 1
               FROM purchases p
               WHERE p.qr_code_id = reward_claims.qr_code_id
             )
           RETURNING status`
        ).bind(claimHash),

        db.prepare(
          `UPDATE products
           SET stock_quantity = stock_quantity - 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT q.product_id
             FROM reward_claims c
             JOIN qr_codes q ON q.id = c.qr_code_id
             WHERE c.token_hash = ?
             LIMIT 1
           )
           AND stock_quantity > 0
           AND EXISTS (
             SELECT 1
             FROM reward_claims c
             JOIN purchases p ON p.qr_code_id = c.qr_code_id
             WHERE c.token_hash = ?
           )`
        ).bind(claimHash, claimHash),

        db.prepare(
          `INSERT INTO inventory_movements (
             product_id,
             movement_type,
             quantity_delta,
             reason,
             purchase_id,
             actor_type,
             actor_identifier,
             created_at
           )
           SELECT
             p.product_id,
             'sale',
             -1,
             ?,
             p.id,
             ?,
             ?,
             CURRENT_TIMESTAMP
           FROM reward_claims c
           JOIN purchases p ON p.qr_code_id = c.qr_code_id
           WHERE c.token_hash = ?
           LIMIT 1`
        ).bind(movementReason, actorType, actorIdentifier, claimHash)
      ]);
    }

    const purchase = firstRow(insertResult);
    if (!purchase || changes(insertResult) !== 1) return { ok: false, code: await classifyClaimFailure(db, claimHash) };

    const qr = firstRow(qrResult);
    const reward = firstRow(rewardResult);
    const claim = firstRow(claimResult);

    if (
      changes(qrResult) !== 1 ||
      changes(rewardResult) !== 1 ||
      changes(claimResult) !== 1 ||
      changes(stockResult) !== 1 ||
      changes(inventoryResult) !== 1 ||
      !qr ||
      !reward ||
      !claim
    ) {
      return { ok: false, code: "REDEMPTION_CONFLICT" };
    }

    // Record purchase attribution
    await recordPurchaseAttribution(
      db,
      purchase.id,
      options.staffUserId || null,
      options.shiftId || null,
      options.staffUserId ? "staff" : "system"
    );

    const product = await db.prepare("SELECT name FROM products WHERE id = ? LIMIT 1").bind(purchase.product_id).first();
    const countRow = await db.prepare("SELECT COUNT(*) AS purchase_count FROM purchases WHERE customer_id = ? AND NOT EXISTS (SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = purchases.id)").bind(purchase.customer_id).first();

    if (options.audit === true) {
      await db.prepare(
        `INSERT INTO audit_events (
           actor_type, actor_identifier, action, entity_type, entity_identifier, metadata_json, created_at
         ) VALUES (?, ?, 'reward_redeemed', 'reward', ?, ?, CURRENT_TIMESTAMP)`
      ).bind(
        actorType,
        actorIdentifier,
        String(reward.cycle_number),
        JSON.stringify({
          purchaseId: purchase.id,
          qrPublicNumber: qr.public_number,
          productId: purchase.product_id,
          regularPriceCents: purchase.regular_price_cents,
          discountPercent: purchase.discount_percent,
          finalPriceCents: purchase.final_price_cents
        })
      ).run();
    }

    return {
      ok: true,
      purchase: {
        id: purchase.id,
        qrNumber: qr.public_number,
        product: { name: product?.name },
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
