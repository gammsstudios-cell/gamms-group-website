CREATE TABLE IF NOT EXISTS site_accounts (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  locale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_site_accounts_email
ON site_accounts(email);

CREATE TABLE IF NOT EXISTS site_account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES site_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_account_sessions_account_id
ON site_account_sessions(account_id);

CREATE INDEX IF NOT EXISTS idx_site_account_sessions_expires_at
ON site_account_sessions(expires_at);
