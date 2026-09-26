// GET /aep/api/seller/my-sales
import { requirePermission } from "../../_lib/staffAuth.js";
import { jsonResponse } from "../../_lib/adminResponses.js";
import { formatFriendlyCustomerId } from "../../_lib/customerProfile.js";

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const perm = await requirePermission(request, env, db, "sales.read_own");
  if (!perm.authorized) return perm.response;

  const staffUserId = perm.actor.userId;

  let query = `
    SELECT 
      p.id, p.created_at as createdAt, p.regular_price_cents as regularPriceCents,
      p.discount_percent as discountPercent, p.final_price_cents as finalPriceCents,
      pr.name as productName, q.public_number as qrNumber, p.customer_id as customerId,
      c.display_name as customerDisplayName
    FROM purchases p
    JOIN products pr ON p.product_id = pr.id
    JOIN qr_codes q ON p.qr_code_id = q.id
    JOIN purchase_attribution pa ON p.id = pa.purchase_id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN purchase_voids pv ON p.id = pv.purchase_id
    WHERE pv.purchase_id IS NULL
  `;

  const params = [];
  if (staffUserId) {
    query += " AND pa.staff_user_id = ?";
    params.push(staffUserId);
  }

  query += " ORDER BY p.id DESC LIMIT 50";

  const rows = await db.prepare(query).bind(...params).all();
  const sales = (rows?.results || []).map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    productName: s.productName,
    qrNumber: s.qrNumber,
    regularPriceCents: s.regularPriceCents,
    discountPercent: s.discountPercent,
    finalPriceCents: s.finalPriceCents,
    customerLabel: formatFriendlyCustomerId(s.customerId),
    customerDisplayName: s.customerDisplayName || null
  }));

  return jsonResponse({
    ok: true,
    sales
  });
}
