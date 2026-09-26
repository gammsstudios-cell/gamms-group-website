export const DEFAULT_SETTINGS = {
  event_name: "GAMMS AEP",
  event_active: "true",
  currency_code: "NIO",
  currency_symbol: "C$",
  claim_ttl_seconds: "300",
  rewards_enabled: "true",
  reward_every_n_purchases: "3",
  reward_discount_percent: "50",
  allow_negative_stock: "false",
  timezone: "America/Managua"
};

export async function getSettings(db) {
  const settings = { ...DEFAULT_SETTINGS };

  if (!db) return settings;

  try {
    const result = await db.prepare("SELECT key, value FROM aep_settings").all();
    if (result?.results) {
      for (const row of result.results) {
        if (row.key in settings) {
          settings[row.key] = row.value;
        }
      }
    }
  } catch (error) {
    // If aep_settings table is missing in older test environments, fallback silently to default settings
  }

  return settings;
}

export async function updateSettings(db, newSettings) {
  if (!db || !newSettings || typeof newSettings !== "object") {
    return { ok: false, code: "INVALID_SETTINGS" };
  }

  const allowedKeys = Object.keys(DEFAULT_SETTINGS);
  const statements = [];
  const updatedKeys = [];

  for (const [key, value] of Object.entries(newSettings)) {
    if (!allowedKeys.includes(key)) continue;
    const strValue = String(value ?? "").trim();
    statements.push(
      db.prepare(
        `INSERT INTO aep_settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
      ).bind(key, strValue)
    );
    updatedKeys.push(key);
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  const current = await getSettings(db);
  return { ok: true, settings: current, updatedKeys };
}
