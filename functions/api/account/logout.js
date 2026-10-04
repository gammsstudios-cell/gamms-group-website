const COOKIE_NAME = 'GAMMS-ACCOUNT-SESSION';
function json(data, headers = {}) { return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } }); }
function readCookie(request, name) { const raw = request.headers.get('Cookie') || ''; for (const part of raw.split(';')) { const i = part.indexOf('='); if (i < 0) continue; if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return null; }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

export async function onRequestPost({ request, env }) {
  const token = readCookie(request, COOKIE_NAME);
  if (token && env.ACCOUNTS_DB) { const hash = await sha256(token); await env.ACCOUNTS_DB.prepare(`DELETE FROM site_account_sessions WHERE token_hash = ?1`).bind(hash).run().catch(() => {}); }
  return json({ ok: true }, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
}

