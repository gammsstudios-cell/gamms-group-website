// GAMMS AEP Customer Profile & Display Name Helpers

/**
 * Validates a customer display name.
 * Range: 2 to 60 characters after trim.
 * Rejects HTML, control characters, empty strings.
 */
export function validateCustomerDisplayName(name) {
  if (typeof name !== "string") {
    return { valid: false, error: "El nombre debe ser una cadena de texto" };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) {
    return { valid: false, error: "El nombre debe tener entre 2 y 60 caracteres" };
  }
  // Reject control characters and HTML tags (< or >)
  if (/[\x00-\x1F\x7F<>]/.test(trimmed)) {
    return { valid: false, error: "El nombre contiene caracteres no permitidos" };
  }
  return { valid: true, name: trimmed };
}

/**
 * Formats a customer UUID into a friendly label like "Cliente #A7F2".
 */
export function formatFriendlyCustomerId(customerId) {
  if (!customerId || typeof customerId !== "string") {
    return "Cliente #0000";
  }
  const clean = customerId.replace(/^customer-/, "").replace(/-/g, "");
  const code = clean.substring(0, 4).toUpperCase();
  return `Cliente #${code}`;
}

/**
 * Simple HTML escaping for display names.
 */
export function sanitizeDisplayName(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Retrieves full customer profile including purchase count, rewards count, and display name.
 */
export async function getCustomerProfile(db, customerId) {
  if (!customerId) return null;

  const customer = await db.prepare(`
    SELECT id, display_name, created_at, last_seen_at
    FROM customers
    WHERE id = ?
  `).bind(customerId).first();

  if (!customer) return null;

  const purchaseCount = await db.prepare(`
    SELECT COUNT(*) as count FROM purchases WHERE customer_id = ? AND NOT EXISTS (SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = purchases.id)
  `).bind(customerId).first();

  const rewardStats = await db.prepare(`
    SELECT 
      COUNT(*) as total_rewards,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_rewards
    FROM rewards
    WHERE customer_id = ?
  `).bind(customerId).first();

  const activeClaim = await db.prepare(`
    SELECT id, token_hash, expires_at, status
    FROM reward_claims
    WHERE customer_id = ? AND status = 'available' AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).bind(customerId).first();

  return {
    id: customer.id,
    displayName: customer.display_name || null,
    customerLabel: formatFriendlyCustomerId(customer.id),
    createdAt: customer.created_at,
    lastSeenAt: customer.last_seen_at,
    purchaseCount: Number(purchaseCount?.count || 0),
    totalRewards: Number(rewardStats?.total_rewards || 0),
    availableRewards: Number(rewardStats?.available_rewards || 0),
    hasActiveClaim: Boolean(activeClaim)
  };
}

/**
 * Updates customer display name.
 */
export async function updateCustomerProfile(db, customerId, displayName) {
  const validation = validateCustomerDisplayName(displayName);
  if (!validation.valid) {
    return validation;
  }

  await db.prepare(`
    UPDATE customers
    SET display_name = ?, last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(validation.name, customerId).run();

  return { valid: true, displayName: validation.name };
}

// Backwards‑compatible exports expected by test suite
export const validateDisplayName = validateCustomerDisplayName;
export const formatCustomerLabel = formatFriendlyCustomerId;

