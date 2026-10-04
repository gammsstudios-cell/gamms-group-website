const COOKIE_NAME = 'GAMMS-ACCOUNT-SESSION';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function accountId(request, db) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await db.prepare(`
    SELECT account_id FROM site_account_sessions
    WHERE token_hash = ?1 AND expires_at > datetime('now') LIMIT 1
  `).bind(hash).first();
  return row?.account_id || null;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin request rejected' }, 403);
  if (!env.ACCOUNTS_DB) return json({ error: 'Database unavailable' }, 503);
  const id = await accountId(request, env.ACCOUNTS_DB);
  if (!id) return json({ error: 'Not authenticated' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const theme = ['system', 'light', 'dark'].includes(body?.theme) ? body.theme : 'system';
  const language = ['es', 'en'].includes(body?.language) ? body.language : 'es';
  const timezone = typeof body?.timezone === 'string' ? body.timezone.trim().slice(0, 64) || null : null;
  const communications = body?.communications_enabled === false || body?.communications_enabled === 0 ? 0 : 1;

  try {
    await env.ACCOUNTS_DB.prepare(`
      INSERT INTO site_account_preferences (account_id, theme, language, timezone, communications_enabled, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
      ON CONFLICT(account_id) DO UPDATE SET
        theme = excluded.theme,
        language = excluded.language,
        timezone = excluded.timezone,
        communications_enabled = excluded.communications_enabled,
        updated_at = datetime('now')
    `).bind(id, theme, language, timezone, communications).run();

    await env.ACCOUNTS_DB.prepare(`
      INSERT INTO site_account_activity (id, account_id, event_type, summary, metadata_json)
      VALUES (?1, ?2, 'preferences_updated', 'Secret ID preferences updated', ?3)
    `).bind(crypto.randomUUID(), id, JSON.stringify({ theme, language, timezone, communications_enabled: communications })).run().catch(() => {});
  } catch (error) {
    console.error('Secret ID preferences failed:', error);
    return json({ error: 'Preferences unavailable until the latest account migration is applied' }, 503);
  }

  return json({ ok: true, preferences: { theme, language, timezone, communications_enabled: communications } });
}
