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

async function authenticate(request, db) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await db.prepare(`
    SELECT a.id, a.email, a.display_name, a.avatar_url, a.locale,
           s.id AS session_id, s.token_hash
    FROM site_account_sessions s
    JOIN site_accounts a ON a.id = s.account_id
    WHERE s.token_hash = ?1 AND s.expires_at > datetime('now')
    LIMIT 1
  `).bind(hash).first();
  return row || null;
}

async function safeAll(db, sql, binds = []) {
  try {
    const stmt = db.prepare(sql).bind(...binds);
    const result = await stmt.all();
    return result.results || [];
  } catch (error) {
    console.warn('Secret ID overview query skipped:', error?.message || error);
    return [];
  }
}

async function safeFirst(db, sql, binds = []) {
  try {
    return await db.prepare(sql).bind(...binds).first();
  } catch (error) {
    console.warn('Secret ID overview query skipped:', error?.message || error);
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.ACCOUNTS_DB) return json({ error: 'Database unavailable' }, 503);
  const auth = await authenticate(request, env.ACCOUNTS_DB);
  if (!auth) return json({ error: 'Not authenticated' }, 401);

  const sessions = await safeAll(env.ACCOUNTS_DB, `
    SELECT id, created_at, expires_at, last_seen_at,
           COALESCE(user_agent, '') AS user_agent,
           COALESCE(auth_method, 'google') AS auth_method
    FROM site_account_sessions
    WHERE account_id = ?1 AND expires_at > datetime('now')
    ORDER BY last_seen_at DESC, created_at DESC
    LIMIT 20
  `, [auth.id]);

  const activity = await safeAll(env.ACCOUNTS_DB, `
    SELECT id, event_type, summary, metadata_json, created_at
    FROM site_account_activity
    WHERE account_id = ?1
    ORDER BY created_at DESC
    LIMIT 30
  `, [auth.id]);

  const notifications = await safeAll(env.ACCOUNTS_DB, `
    SELECT id, notification_type, title, body, action_url, read_at, created_at
    FROM site_account_notifications
    WHERE account_id = ?1
    ORDER BY created_at DESC
    LIMIT 30
  `, [auth.id]);

  const organizations = await safeAll(env.ACCOUNTS_DB, `
    SELECT o.id, o.name, o.slug, m.role, o.created_at
    FROM site_organization_members m
    JOIN site_organizations o ON o.id = m.organization_id
    WHERE m.account_id = ?1
    ORDER BY o.name COLLATE NOCASE ASC
  `, [auth.id]);

  const preferences = await safeFirst(env.ACCOUNTS_DB, `
    SELECT theme, language, timezone, communications_enabled, updated_at
    FROM site_account_preferences
    WHERE account_id = ?1
    LIMIT 1
  `, [auth.id]);

  const recoveryEmails = await safeAll(env.ACCOUNTS_DB, `
    SELECT id, email, verified_at, created_at
    FROM site_account_recovery_emails
    WHERE account_id = ?1
    ORDER BY created_at ASC
  `, [auth.id]);

  const passkeys = await safeAll(env.ACCOUNTS_DB, `
    SELECT id, created_at, last_used_at
    FROM site_account_passkeys
    WHERE account_id = ?1
    ORDER BY created_at DESC
  `, [auth.id]);

  const apiTokens = await safeAll(env.ACCOUNTS_DB, `
    SELECT id, name, scopes, last_used_at, expires_at, created_at, revoked_at
    FROM site_account_api_tokens
    WHERE account_id = ?1
    ORDER BY created_at DESC
  `, [auth.id]);

  const unreadNotifications = notifications.filter((item) => !item.read_at).length;

  return json({
    user: {
      id: auth.id,
      email: auth.email,
      name: auth.display_name,
      picture: auth.avatar_url || null,
      locale: auth.locale || null,
    },
    currentSessionId: auth.session_id,
    sessions: sessions.map((item) => ({ ...item, current: item.id === auth.session_id })),
    activity,
    notifications,
    unreadNotifications,
    organizations,
    preferences: preferences || {
      theme: 'system',
      language: auth.locale?.startsWith('en') ? 'en' : 'es',
      timezone: null,
      communications_enabled: 1,
    },
    recoveryEmails,
    passkeys,
    apiTokens,
  });
}
