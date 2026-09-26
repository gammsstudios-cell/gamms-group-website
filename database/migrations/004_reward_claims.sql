PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reward_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reward_id INTEGER NOT NULL,
    customer_id TEXT NOT NULL,
    qr_code_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'redeemed', 'expired', 'cancelled')),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    redeemed_at TEXT,
    redeemed_purchase_id INTEGER,

    FOREIGN KEY (reward_id) REFERENCES rewards(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id),
    FOREIGN KEY (redeemed_purchase_id) REFERENCES purchases(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_claims_available_reward
ON reward_claims(reward_id)
WHERE status = 'available';

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_claims_available_qr
ON reward_claims(qr_code_id)
WHERE status = 'available';

CREATE INDEX IF NOT EXISTS idx_reward_claims_token_hash
ON reward_claims(token_hash);

CREATE INDEX IF NOT EXISTS idx_reward_claims_customer_status
ON reward_claims(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_reward_claims_expires_at
ON reward_claims(expires_at);
