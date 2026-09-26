PRAGMA foreign_keys = ON;

-- Add customer friendly display name
ALTER TABLE customers ADD COLUMN display_name TEXT;

-- Rebuild reward_claims to allow qr_code_id to be NULL (reward claim generated before 3rd drink physical QR scan)
CREATE TABLE reward_claims_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reward_id INTEGER NOT NULL,
    customer_id TEXT NOT NULL,
    qr_code_id INTEGER NULL,
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

INSERT INTO reward_claims_new (
    id, reward_id, customer_id, qr_code_id, token_hash, status, created_at, expires_at, redeemed_at, redeemed_purchase_id
)
SELECT id, reward_id, customer_id, qr_code_id, token_hash, status, created_at, expires_at, redeemed_at, redeemed_purchase_id
FROM reward_claims;

DROP TABLE reward_claims;

ALTER TABLE reward_claims_new RENAME TO reward_claims;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_claims_available_reward
ON reward_claims(reward_id)
WHERE status = 'available';

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_claims_available_qr
ON reward_claims(qr_code_id)
WHERE status = 'available' AND qr_code_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_reward_claims_customer_status
ON reward_claims(customer_id, status);


CREATE INDEX IF NOT EXISTS idx_reward_claims_expires_at
ON reward_claims(expires_at);
