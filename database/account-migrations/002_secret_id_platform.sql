-- Secret ID platform layer: sessions, activity, notifications, organizations and preferences.

ALTER TABLE site_account_sessions ADD COLUMN user_agent TEXT;
ALTER TABLE site_account_sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'google';

CREATE TABLE IF NOT EXISTS site_account_activity (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES site_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_account_activity_account_created
ON site_account_activity(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_account_notifications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES site_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_account_notifications_account_created
ON site_account_notifications(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by_account_id) REFERENCES site_accounts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS site_organization_members (
  organization_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (organization_id, account_id),
  FOREIGN KEY (organization_id) REFERENCES site_organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES site_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_organization_members_account
ON site_organization_members(account_id);

CREATE TABLE IF NOT EXISTS site_account_preferences (
  account_id TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'system',
  language TEXT NOT NULL DEFAULT 'es',
  timezone TEXT,
  communications_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES site_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_account_recovery_emails (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  email TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, email),
  FOREIGN KEY (account_id) REFERENCES site_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_account_passkeys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  FOREIGN KEY (account_id) REFERENCES site_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_account_api_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT,
  last_used_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (account_id) REFERENCES site_accounts(id) ON DELETE CASCADE
);
