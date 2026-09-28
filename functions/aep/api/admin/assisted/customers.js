import { requirePermission } from "../../../_lib/staffAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { generateCustomerId } from "../../../_lib/cookies.js";
import { formatFriendlyCustomerId, sanitizeDisplayName, validateDisplayName } from "../../../_lib/customerProfile.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "pos.access");
  if (!perm.authorized) return perm.response;

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const like = `%${q}%`;
  const rows = await db.prepare(
    `SELECT id, display_name, created_at, last_seen_at
     FROM customers
     WHERE (? = '' OR display_name LIKE ? OR id LIKE ?)
     ORDER BY last_seen_at DESC
     LIMIT 25`
  ).bind(q, like, like).all();

  const items = (rows?.results || []).map((row) => ({
    id: row.id,
    displayName: row.display_name || null,
    customerLabel: formatFriendlyCustomerId(row.id),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  }));

  return adminJson({ ok: true, items });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "pos.access");
  if (!perm.authorized) return perm.response;

  const csrf = validateCsrf(request);
  if (!csrf.ok) return adminError(csrf.code, csrf.status);

  let body;
  try {
    body = await request.json();
  } catch {
    return adminError("INVALID_JSON", 400);
  }

  const validation = validateDisplayName(body?.displayName || body?.name || "");
  if (!validation.valid) return adminError("INVALID_CUSTOMER_NAME", 400, validation.error);

  const customerId = generateCustomerId();
  const displayName = sanitizeDisplayName(validation.value);

  await db.prepare(
    `INSERT INTO customers (id, display_name, created_at, last_seen_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(customerId, displayName).run();

  return adminJson({
    ok: true,
    customer: {
      id: customerId,
      displayName,
      customerLabel: formatFriendlyCustomerId(customerId)
    }
  }, { status: 201 });
}
