PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS qr_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_number INTEGER NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,
    product_id INTEGER,
    status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'used', 'disabled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    qr_code_id INTEGER NOT NULL UNIQUE,

    regular_price_cents INTEGER NOT NULL,
    discount_percent INTEGER NOT NULL DEFAULT 0
        CHECK (discount_percent BETWEEN 0 AND 100),

    final_price_cents INTEGER NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id)
);

CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,

    reward_type TEXT NOT NULL DEFAULT 'third_drink_50',
    discount_percent INTEGER NOT NULL DEFAULT 50,

    status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'redeemed', 'expired', 'cancelled')),

    unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    redeemed_at TEXT,
    redeemed_purchase_id INTEGER,

    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (redeemed_purchase_id) REFERENCES purchases(id)
);

CREATE INDEX IF NOT EXISTS idx_qr_token_hash
ON qr_codes(token_hash);

CREATE INDEX IF NOT EXISTS idx_purchases_customer
ON purchases(customer_id);

CREATE INDEX IF NOT EXISTS idx_rewards_customer_status
ON rewards(customer_id, status);
