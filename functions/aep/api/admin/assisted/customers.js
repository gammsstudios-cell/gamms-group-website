import { requirePermission } from "../../../_lib/staffAuth.js";
import { adminError, adminJson, validateCsrf } from "../../../_lib/adminResponses.js";
import { generateCustomerId } from "../../../_lib/cookies.js";
import { formatFriendlyCustomerId, validateDisplayName } from "../../../_lib/customerProfile.js";
import { listAvailableCustomerRewards } from "../../../_lib/promotions.js";

function customerIdSearchPattern(query) {
  const value = String(query || "").trim();
  const friendly = value.match(/^(?:cliente\s*)?#?([a-z0-9]{1,32})$/i);
  if (friendly) return `cust_${friendly[1]}%`;
  return `%${value}%`;
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "pos.access");
  if (!perm.authorized) return perm.response;

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const like = `%${q}%`;
  const idLike = customerIdSearchPattern(q);
  const rows = await db.prepare(
    `SELECT c.id, c.display_name, c.created_at, c.last_seen_at,
            CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS identity_issued
     FROM customers c
     LEFT JOIN customer_identity_tokens t ON t.customer_id = c.id AND t.active = 1
     WHERE (? = '' OR c.display_name LIKE ? OR c.id LIKE ?)
     ORDER BY c.last_seen_at DESC
     LIMIT 25`
  ).bind(q, like, idLike).all();

  const items = [];
  for (const row of rows?.results || []) {
    const rewards = await listAvailableCustomerRewards(db, row.id);
    items.push({
      id: row.id,
      displayName: row.display_name || null,
      customerLabel: formatFriendlyCustomerId(row.id),
      identityIssued: Boolean(row.identity_issued),
      availableRewardsCount: rewards.length,
      availableRewards: rewards,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at
    });
  }

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
  const displayName = validation.name;

  await db.prepare(
    `INSERT INTO customers (id, display_name, created_at, last_seen_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(customerId, displayName).run();

  return adminJson({
    ok: true,
    customer: {
      id: customerId,
      displayName,
      customerLabel: formatFriendlyCustomerId(customerId),
      identityIssued: false
    }
  }, { status: 201 });
}
