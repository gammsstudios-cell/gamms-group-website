import { sha256Hex } from "./crypto.js";

export async function listSellers(db) {
  if (!db) return [];

  try {
    const result = await db
      .prepare(
        `SELECT id, display_name, username, active, created_at, last_login_at
         FROM sellers
         ORDER BY active DESC, display_name ASC`
      )
      .all();

    return (result?.results ?? []).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      username: row.username,
      active: Boolean(row.active),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    }));
  } catch {
    return [];
  }
}

export async function createSellerAccount(db, { displayName, username, passcode }) {
  const name = String(displayName ?? "").trim();
  if (!name || name.length < 2) {
    return { ok: false, code: "INVALID_DISPLAY_NAME" };
  }

  const pass = String(passcode ?? "").trim();
  if (!pass || pass.length < 4) {
    return { ok: false, code: "INVALID_PASSCODE", message: "Passcode must be at least 4 characters." };
  }

  const user = username ? String(username).trim().toLowerCase() : null;
  const hash = await sha256Hex(pass);

  try {
    const result = await db
      .prepare(
        `INSERT INTO sellers (display_name, username, passcode_hash, active, created_at)
         VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
         RETURNING id`
      )
      .bind(name, user, hash)
      .first();

    return {
      ok: true,
      seller: {
        id: result?.id,
        displayName: name,
        username: user,
        active: true
      }
    };
  } catch (error) {
    if (error?.message?.includes("UNIQUE constraint failed: sellers.username")) {
      return { ok: false, code: "USERNAME_TAKEN" };
    }
    return { ok: false, code: "DATABASE_ERROR", message: error.message };
  }
}

export async function updateSellerAccount(db, id, { displayName, active }) {
  const sellerId = Number.parseInt(id, 10);
  if (!Number.isInteger(sellerId) || sellerId < 1) {
    return { ok: false, code: "INVALID_SELLER_ID" };
  }

  const name = displayName !== undefined ? String(displayName).trim() : null;
  const activeVal = active !== undefined ? (active ? 1 : 0) : null;

  try {
    if (name !== null && activeVal !== null) {
      await db
        .prepare("UPDATE sellers SET display_name = ?, active = ? WHERE id = ?")
        .bind(name, activeVal, sellerId)
        .run();
    } else if (name !== null) {
      await db
        .prepare("UPDATE sellers SET display_name = ? WHERE id = ?")
        .bind(name, sellerId)
        .run();
    } else if (activeVal !== null) {
      await db
        .prepare("UPDATE sellers SET active = ? WHERE id = ?")
        .bind(activeVal, sellerId)
        .run();
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, code: "DATABASE_ERROR", message: error.message };
  }
}

export async function resetSellerPasscode(db, id, passcode) {
  const sellerId = Number.parseInt(id, 10);
  if (!Number.isInteger(sellerId) || sellerId < 1) {
    return { ok: false, code: "INVALID_SELLER_ID" };
  }

  const pass = String(passcode ?? "").trim();
  if (!pass || pass.length < 4) {
    return { ok: false, code: "INVALID_PASSCODE" };
  }

  const hash = await sha256Hex(pass);

  try {
    await db
      .prepare("UPDATE sellers SET passcode_hash = ? WHERE id = ?")
      .bind(hash, sellerId)
      .run();

    // Invalidate active seller sessions if table exists
    try {
      await db.prepare("DELETE FROM seller_sessions WHERE seller_id = ?").bind(sellerId).run();
    } catch {}

    return { ok: true };
  } catch (error) {
    return { ok: false, code: "DATABASE_ERROR", message: error.message };
  }
}
