PRAGMA foreign_keys = ON;

-- Replay protection table for TOTP authentication
CREATE TABLE IF NOT EXISTS auth_totp_replay_state (
    principal_ref TEXT PRIMARY KEY,
    last_used_step INTEGER NOT NULL CHECK (last_used_step >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Typed auth lockout state for principals that are not DB staff rows.
-- Used for Owner ENV MFA failures after the Owner password has already passed.
CREATE TABLE IF NOT EXISTS auth_principal_lockout_state (
    principal_ref TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0
        CHECK(failed_count >= 0),
    locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
