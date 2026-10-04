const COOKIE_NAME = 'GAMMS-ACCOUNT-SESSION';
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
function readCookie(request, name) { const raw = request.headers.get('Cookie') || ''; for (const part of raw.split(';')) { const i = part.indexOf('='); if (i < 0) continue; if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return null; }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'Database unavailable' }, 503);
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return json({ error: 'Not authenticated' }, 401);
  const hash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT a.id, a.email, a.display_name, a.avatar_url, a.locale, s.id AS session_id
    FROM site_account_sessions s JOIN site_accounts a ON a.id = s.account_id
    WHERE s.token_hash = ?1 AND s.expires_at > datetime('now') LIMIT 1
  `).bind(hash).first();
  if (!row) return json({ error: 'Not authenticated' }, 401);
  env.DB.prepare(`UPDATE site_account_sessions SET last_seen_at = datetime('now') WHERE id = ?1`).bind(row.session_id).run().catch(() => {});
  return json({ user: { id: row.id, email: row.email, name: row.display_name, picture: row.avatar_url || null, locale: row.locale || null } });
}
