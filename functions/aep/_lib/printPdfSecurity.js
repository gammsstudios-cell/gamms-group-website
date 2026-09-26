import { hashQrToken, isValidTokenFormat } from "./crypto.js";

function asCleanString(value) {
  return String(value ?? "").trim();
}

export function sanitizePdfFilenamePart(value, fallback = "Item") {
  const ascii = asCleanString(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["\r\n/\\\x00-\x1F\x7F]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-_\s]+|[.\-_\s]+$/g, "")
    .slice(0, 80);
  return ascii || fallback;
}

export function buildLabelsPdfFilename({ productName, firstPublicNumber, lastPublicNumber, profileName }) {
  const product = sanitizePdfFilenamePart(productName, "Producto");
  const profile = sanitizePdfFilenamePart(profileName, "Perfil");
  const first = String(firstPublicNumber).padStart(4, "0");
  const last = String(lastPublicNumber).padStart(4, "0");
  return `GAMMS-AEP_${product}_QR-${first}-${last}_${profile}.pdf`;
}

export function buildPromoUrl(requestUrl, token) {
  const origin = new URL(requestUrl).origin;
  return `${origin}/aep/promo/r/${token}`;
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export async function validateBatchPdfLabels(db, requestUrl, body = {}) {
  const batchId = asCleanString(body.batchId ?? body.batch_id);
  if (!batchId) return { ok: false, code: "INVALID_BATCH" };

  const rawTokens = Array.isArray(body.tokens) ? body.tokens.map((token) => ({ token })) : null;
  const rawItems = rawTokens ?? body.items ?? body.labels;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 500) {
    return { ok: false, code: "INVALID_LABEL_COUNT" };
  }

  const tokenSet = new Set();
  const publicNumberSet = new Set();
  const labels = [];

  const batch = await db.prepare(
    `SELECT
       b.id,
       b.product_id,
       b.quantity,
       b.first_public_number,
       b.last_public_number,
       b.print_profile_id,
       b.start_slot,
       p.name AS product_name,
       pp.name AS print_profile_name
     FROM qr_batches b
     JOIN products p ON p.id = b.product_id
     LEFT JOIN print_profiles pp ON pp.id = b.print_profile_id
     WHERE b.id = ?
     LIMIT 1`
  ).bind(batchId).first();

  if (!batch) return { ok: false, code: "INVALID_BATCH" };
  if (rawItems.length !== Number(batch.quantity)) return { ok: false, code: "INVALID_LABEL_COUNT" };

  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index];
    const token = asCleanString(item?.token);
    if (!isValidTokenFormat(token)) return { ok: false, code: "INVALID_QR_TOKEN" };
    if (tokenSet.has(token)) return { ok: false, code: "DUPLICATE_PRINT_ITEM" };
    tokenSet.add(token);

    const tokenHash = await hashQrToken(token);
    const row = await db.prepare(
      `SELECT
         q.id AS qr_code_id,
         q.public_number,
         q.token_hash,
         q.product_id,
         p.name AS product_name,
         i.sequence_number
       FROM qr_batch_items i
       JOIN qr_codes q ON q.id = i.qr_code_id
       JOIN products p ON p.id = q.product_id
       WHERE i.batch_id = ?
         AND q.token_hash = ?
       LIMIT 1`
    ).bind(batchId, tokenHash).first();

    if (!row) return { ok: false, code: "QR_BATCH_MISMATCH" };
    if (row.product_id !== batch.product_id) return { ok: false, code: "QR_BATCH_MISMATCH" };
    if (Number(row.sequence_number) !== index + 1) return { ok: false, code: "INVALID_PRINT_ITEM" };
    if (publicNumberSet.has(row.public_number)) return { ok: false, code: "DUPLICATE_PRINT_ITEM" };
    publicNumberSet.add(row.public_number);

    labels.push({
      publicNumber: row.public_number,
      productName: row.product_name,
      url: buildPromoUrl(requestUrl, token)
    });
  }

  const expectedFirst = Math.min(...labels.map((item) => Number(item.publicNumber)));
  const expectedLast = Math.max(...labels.map((item) => Number(item.publicNumber)));
  if (expectedFirst !== batch.first_public_number || expectedLast !== batch.last_public_number) {
    return { ok: false, code: "QR_BATCH_MISMATCH" };
  }

  return {
    ok: true,
    batch: {
      id: batch.id,
      productId: batch.product_id,
      productName: batch.product_name,
      quantity: batch.quantity,
      firstPublicNumber: batch.first_public_number,
      lastPublicNumber: batch.last_public_number,
      printProfileId: batch.print_profile_id,
      printProfileName: batch.print_profile_name,
      startSlot: batch.start_slot
    },
    labels
  };
}

export function exactlyOneChange(result) {
  return changes(result) === 1;
}
