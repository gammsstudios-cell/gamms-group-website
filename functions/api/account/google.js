const COOKIE_NAME = 'GAMMS-ACCOUNT-SESSION';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
function json(data, init = {}) { const headers = new Headers(init.headers || {}); headers.set('Content-Type', 'application/json; charset=utf-8'); headers.set('Cache-Control', 'no-store'); return new Response(JSON.stringify(data), { ...init, headers }); }
function publicUser(row) { return { id: row.id, email: row.email, name: row.display_name, picture: row.avatar_url || null, locale: row.locale || null }; }
function randomToken(bytes = 32) { const data = new Uint8Array(bytes); crypto.getRandomValues(data); return [...data].map((v) => v.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join(''); }
function sessionCookie(token) { return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`; }

let jwksCache = { keys: [], expiresAt: 0 };

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function getGoogleJwks() {
  if (jwksCache.keys.length && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error('Unable to load Google signing keys');
  const body = await response.json();
  const cacheControl = response.headers.get('Cache-Control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 1800);
  jwksCache = { keys: Array.isArray(body.keys) ? body.keys : [], expiresAt: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

async function verifyGoogleIdToken(token, clientId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const payload = decodeJsonPart(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected JWT algorithm');

  const keys = await getGoogleJwks();
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('Unknown Google signing key');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signedData = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = decodeBase64Url(encodedSignature);
  const validSignature = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData);
  if (!validSignature) throw new Error('Invalid JWT signature');

  const now = Math.floor(Date.now() / 1000);
  const issuerOk = payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com';
  const audienceOk = payload.aud === clientId || (Array.isArray(payload.aud) && payload.aud.includes(clientId));
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!issuerOk || !audienceOk || !payload.exp || payload.exp <= now || (payload.iat && payload.iat > now + 300)) throw new Error('Invalid JWT claims');
  if (!payload.sub || !payload.email || !emailVerified) throw new Error('Incomplete Google identity');
  return payload;
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin request rejected' }, { status: 403 });
  if (!env.DB) return json({ error: 'Database unavailable' }, { status: 503 });
  if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google Sign-In is not configured' }, { status: 503 });

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }

  const credential = typeof body?.credential === 'string' ? body.credential.trim() : '';
  if (!credential || credential.length > 10000) return json({ error: 'Missing Google credential' }, { status: 400 });

  let claims;
  try { claims = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID); }
  catch (error) {
    console.warn('Google token verification failed:', error?.message || error);
    return json({ error: 'Google credential rejected' }, { status: 401 });
  }

  const email = String(claims.email).toLowerCase().slice(0, 320);
  const name = String(claims.name || claims.given_name || email.split('@')[0]).slice(0, 160);
  const picture = claims.picture ? String(claims.picture).slice(0, 1000) : null;
  const locale = claims.locale ? String(claims.locale).slice(0, 24) : null;

  let account = await env.DB.prepare(`SELECT * FROM site_accounts WHERE google_sub = ?1 LIMIT 1`).bind(claims.sub).first();
  if (!account) {
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO site_accounts (id, google_sub, email, display_name, avatar_url, locale)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(id, claims.sub, email, name, picture, locale).run();
    account = await env.DB.prepare(`SELECT * FROM site_accounts WHERE id = ?1`).bind(id).first();
  } else {
    await env.DB.prepare(`
      UPDATE site_accounts
      SET email = ?1, display_name = ?2, avatar_url = ?3, locale = ?4,
          updated_at = datetime('now'), last_login_at = datetime('now')
      WHERE id = ?5
    `).bind(email, name, picture, locale, account.id).run();
    account = await env.DB.prepare(`SELECT * FROM site_accounts WHERE id = ?1`).bind(account.id).first();
  }

  const token = randomToken();
  const hash = await sha256(token);
  const sessionId = crypto.randomUUID();
  await env.DB.prepare(`DELETE FROM site_account_sessions WHERE expires_at <= datetime('now')`).run();
  await env.DB.prepare(`
    INSERT INTO site_account_sessions (id, account_id, token_hash, expires_at)
    VALUES (?1, ?2, ?3, datetime('now', '+30 days'))
  `).bind(sessionId, account.id, hash).run();

  return json({ user: publicUser(account) }, {
    status: 200,
    headers: { 'Set-Cookie': sessionCookie(token) },
  });
}
