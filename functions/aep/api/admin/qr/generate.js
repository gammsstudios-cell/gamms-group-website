import { requireAdminAuth } from "../../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { generateQrBatch } from "../../../_lib/adminQr.js";
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

  const url = new URL(context.request.url);
  const baseUrl = body?.baseUrl ?? `${url.protocol}//${url.host}`;

  const result = await generateQrBatch(context.env.DB, {
    productId: body?.product_id ?? body?.productId,
    count: body?.count ?? 50,
    startNumber: body?.start_number ?? body?.startNumber,
    tokenLength: body?.token_length ?? body?.tokenLength ?? 12,
    baseUrl,
    printProfileId: body?.print_profile_id ?? body?.printProfileId,
    startSlot: body?.start_slot ?? body?.startSlot ?? 1,
    createdBy: auth.payload.sub ?? "admin"
  });

  if (!result.ok) {
    return adminError(result.code, 400, result.message);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "qr_batch_generated",
    entityType: "qr_batch",
    entityIdentifier: `${result.startNumber}-${result.endNumber}`,
    metadata: {
      productId: body?.product_id ?? body?.productId,
      count: result.count,
      startNumber: result.startNumber,
      endNumber: result.endNumber,
      batchId: result.batchId,
      printProfileId: result.printProfile?.id,
      startSlot: result.startSlot
    }
  });

  return adminJson({
    ok: true,
    batchId: result.batchId,
    count: result.count,
    startNumber: result.startNumber,
    endNumber: result.endNumber,
    printProfile: result.printProfile,
    startSlot: result.startSlot,
    items: result.items
  }, { status: 201 });
}
