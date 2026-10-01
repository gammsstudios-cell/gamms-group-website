PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customer_identity_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,
    rotated_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CHECK (
        (active = 1 AND revoked_at IS NULL)
        OR
        (active = 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_identity_one_active
ON customer_identity_tokens(customer_id)
WHERE active = 1;

CREATE INDEX IF NOT EXISTS idx_customer_identity_customer
ON customer_identity_tokens(customer_id);
