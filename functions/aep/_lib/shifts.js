// GAMMS AEP Staff Work Shifts Library
import { logAuditEvent } from "./audit.js";

/**
 * Gets the current active shift for a staff user.
 */
export async function getCurrentShift(db, userId) {
  if (!userId) return null;
  const shift = await db.prepare(`
    SELECT id, user_id, started_at, ended_at, status, opening_note, closing_note, created_at
    FROM staff_shifts
    WHERE user_id = ? AND status = 'open'
    ORDER BY id DESC
    LIMIT 1
  `).bind(userId).first();

  if (!shift) return null;

  // Compute shift sales summary
  const summary = await db.prepare(`
    SELECT 
      COUNT(p.id) as sales_count,
      COALESCE(SUM(p.final_price_cents), 0) as revenue_cents,
      SUM(CASE WHEN p.discount_percent > 0 THEN 1 ELSE 0 END) as rewards_count
    FROM purchases p
    JOIN purchase_attribution pa ON p.id = pa.purchase_id
    WHERE pa.shift_id = ?
  `).bind(shift.id).first();

  return {
    ...shift,
    salesCount: Number(summary?.sales_count || 0),
    revenueCents: Number(summary?.revenue_cents || 0),
    rewardsCount: Number(summary?.rewards_count || 0)
  };
}

/**
 * Starts a new shift for a staff user. Rejects if an open shift already exists.
 */
export async function startShift(db, actor, openingNote = null) {
  const userId = actor.userId;
  if (!userId) {
    return { valid: false, error: "Se requiere una cuenta de usuario interna para iniciar turno" };
  }

  const existing = await getCurrentShift(db, userId);
  if (existing) {
    return { valid: false, error: "Ya tienes un turno activo en curso" };
  }

  const stmt = await db.prepare(`
    INSERT INTO staff_shifts (user_id, status, opening_note)
    VALUES (?, 'open', ?)
    RETURNING id, started_at
  `).bind(userId, openingNote || null).first();

  await logAuditEvent(db, {
    actorType: actor.type || "staff",
    actorIdentifier: actor.identifier || String(userId),
    action: "shift.started",
    entityType: "staff_shift",
    entityIdentifier: String(stmt.id),
    metadata: { openingNote }
  });

  return { valid: true, shiftId: stmt.id, startedAt: stmt.started_at };
}

/**
 * Closes the current active shift for a staff user.
 */
export async function closeShift(db, actor, closingNote = null) {
  const userId = actor.userId;
  if (!userId) {
    return { valid: false, error: "Usuario no identificado" };
  }

  const activeShift = await getCurrentShift(db, userId);
  if (!activeShift) {
    return { valid: false, error: "No tienes ningún turno activo para cerrar" };
  }

  const endedAt = new Date().toISOString();
  await db.prepare(`
    UPDATE staff_shifts
    SET status = 'closed', ended_at = ?, closing_note = ?
    WHERE id = ?
  `).bind(endedAt, closingNote || null, activeShift.id).run();

  await logAuditEvent(db, {
    actorType: actor.type || "staff",
    actorIdentifier: actor.identifier || String(userId),
    action: "shift.closed",
    entityType: "staff_shift",
    entityIdentifier: String(activeShift.id),
    metadata: {
      closingNote,
      salesCount: activeShift.salesCount,
      revenueCents: activeShift.revenueCents
    }
  });

  return { valid: true, shiftId: activeShift.id, endedAt };
}

/**
 * Lists all shifts with user info and sales aggregates.
 */
export async function listShifts(db, filters = {}) {
  let query = `
    SELECT 
      s.id, s.user_id as userId, u.username, u.display_name as displayName,
      s.started_at as startedAt, s.ended_at as endedAt, s.status,
      s.opening_note as openingNote, s.closing_note as closingNote, s.created_at as createdAt
    FROM staff_shifts s
    LEFT JOIN aep_users u ON s.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.userId) {
    query += " AND s.user_id = ?";
    params.push(filters.userId);
  }

  if (filters.status) {
    query += " AND s.status = ?";
    params.push(filters.status);
  }

  query += " ORDER BY s.id DESC LIMIT 100";

  const rows = await db.prepare(query).bind(...params).all();
  const shifts = rows?.results || [];

  for (const sh of shifts) {
    const summary = await db.prepare(`
      SELECT 
        COUNT(p.id) as sales_count,
        COALESCE(SUM(p.final_price_cents), 0) as revenue_cents,
        SUM(CASE WHEN p.discount_percent > 0 THEN 1 ELSE 0 END) as rewards_count
      FROM purchases p
      JOIN purchase_attribution pa ON p.id = pa.purchase_id
      WHERE pa.shift_id = ?
    `).bind(sh.id).first();

    sh.salesCount = Number(summary?.sales_count || 0);
    sh.revenueCents = Number(summary?.revenue_cents || 0);
    sh.rewardsCount = Number(summary?.rewards_count || 0);
  }

  return shifts;
}
