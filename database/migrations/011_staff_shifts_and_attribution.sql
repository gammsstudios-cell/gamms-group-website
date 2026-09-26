PRAGMA foreign_keys = ON;

-- Unified staff sessions table
CREATE TABLE IF NOT EXISTS aep_staff_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    session_version INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES aep_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_user ON aep_staff_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON aep_staff_sessions(expires_at);

-- Staff work shifts table
CREATE TABLE IF NOT EXISTS staff_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opening_note TEXT,
    closing_note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES aep_users(id),
    UNIQUE (id, user_id),
    CHECK (
        (status = 'open' AND ended_at IS NULL)
        OR
        (status = 'closed' AND ended_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_open_per_user
ON staff_shifts(user_id)
WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_shifts_user_status ON staff_shifts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_shifts_started_at ON staff_shifts(started_at DESC);

-- Purchase attribution table (additive, optional link to staff user and shift)
CREATE TABLE IF NOT EXISTS purchase_attribution (
    purchase_id INTEGER PRIMARY KEY,
    staff_user_id INTEGER,
    shift_id INTEGER,
    actor_type TEXT NOT NULL DEFAULT 'customer' CHECK (actor_type IN ('customer', 'staff', 'system')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id),
    FOREIGN KEY (staff_user_id) REFERENCES aep_users(id),
    FOREIGN KEY (shift_id, staff_user_id) REFERENCES staff_shifts(id, user_id),
    CHECK (
        (actor_type = 'customer' AND staff_user_id IS NULL AND shift_id IS NULL)
        OR
        (actor_type = 'staff' AND staff_user_id IS NOT NULL)
        OR
        (actor_type = 'system' AND staff_user_id IS NULL AND shift_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_purchase_attr_staff ON purchase_attribution(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_attr_shift ON purchase_attribution(shift_id);
