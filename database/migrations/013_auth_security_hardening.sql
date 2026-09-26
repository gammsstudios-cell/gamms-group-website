PRAGMA foreign_keys = ON;

-- Replay protection table for TOTP authentication
CREATE TABLE IF NOT EXISTS auth_totp_replay_state (
    principal_ref TEXT PRIMARY KEY,
    last_used_step INTEGER NOT NULL CHECK (last_used_step >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
