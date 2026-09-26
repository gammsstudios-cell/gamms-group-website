import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminError, adminJson, validateCsrf } from "../../_lib/adminResponses.js";
import { logAuditEvent } from "../../_lib/audit.js";
import { createSellerAccount, listSellers } from "../../_lib/sellers.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  try {
    const sellers = await listSellers(context.env.DB);
    return adminJson({ ok: true, sellers });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}

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

  const result = await createSellerAccount(context.env.DB, {
    displayName: body?.displayName ?? body?.display_name,
    username: body?.username,
    passcode: body?.passcode
  });

  if (!result.ok) {
    return adminError(result.code, 400, result.message);
  }

  await logAuditEvent(context.env.DB, {
    actorType: "admin",
    actorIdentifier: auth.payload.sub ?? "admin",
    action: "seller_created",
    entityType: "seller",
    entityIdentifier: String(result.seller.id),
    metadata: { displayName: result.seller.displayName, username: result.seller.username }
  });

  return adminJson({ ok: true, seller: result.seller }, { status: 201 });
}
