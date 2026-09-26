import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, validateCsrf, DEFAULT_SECURITY_HEADERS } from "../../../_lib/adminResponses.js";
import { generateLabelsPdf } from "../../../_lib/printPdf.js";
import { getPrintProfile } from "../../../_lib/printProfiles.js";
import { buildLabelsPdfFilename, validateBatchPdfLabels } from "../../../_lib/printPdfSecurity.js";
import { logAuditEvent } from "../../../_lib/audit.js";

export async function onRequestPost(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const csrf = validateCsrf(context.request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const validation = await validateBatchPdfLabels(context.env.DB, context.request.url, body);
  if (!validation.ok) return adminError(validation.code, 400);

  const profile = await getPrintProfile(context.env.DB, body?.printProfileId ?? body?.print_profile_id ?? validation.batch.printProfileId);
  if (!profile) return adminError("PROFILE_NOT_FOUND", 404);

  const requestedStartSlot = body?.startSlot ?? body?.start_slot ?? validation.batch.startSlot;
  const result = await generateLabelsPdf({
    labels: validation.labels,
    profile,
    startSlot: requestedStartSlot,
    drawGuides: false,
    printOrder: body?.printOrder ?? body?.print_order
  });
  if (!result.ok) return adminError(result.code, 400);

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "label.pdf.generated",
    entityType: "qr_batch",
    entityIdentifier: validation.batch.id,
    metadata: {
      batchId: validation.batch.id,
      productId: validation.batch.productId,
      quantity: validation.batch.quantity,
      firstPublicNumber: validation.batch.firstPublicNumber,
      lastPublicNumber: validation.batch.lastPublicNumber,
      profileId: profile.id,
      startSlot: Number.parseInt(requestedStartSlot, 10),
      pageCount: result.pageCount
    }
  });

  const filename = buildLabelsPdfFilename({
    productName: validation.batch.productName,
    firstPublicNumber: validation.batch.firstPublicNumber,
    lastPublicNumber: validation.batch.lastPublicNumber,
    profileName: profile.name
  });

  return new Response(result.bytes, {
    status: 200,
    headers: {
      ...DEFAULT_SECURITY_HEADERS,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store"
    }
  });
}
