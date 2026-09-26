PRAGMA foreign_keys = ON;

-- Extend products table with extra inventory & metadata fields
ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'bebidas';
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0);
ALTER TABLE products ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN image_url TEXT;
ALTER TABLE products ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Ledger table for real inventory movements
CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('initial', 'restock', 'sale', 'adjustment', 'return', 'correction')),
    quantity_delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    purchase_id INTEGER NULL,
    admin_note TEXT NULL,
    actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('admin', 'seller', 'system', 'customer')),
    actor_identifier TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase ON inventory_movements(purchase_id);

-- Sellers management table
CREATE TABLE IF NOT EXISTS sellers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    username TEXT UNIQUE,
    passcode_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS seller_sessions (
    id TEXT PRIMARY KEY,
    seller_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
);

CREATE INDEX IF NOT EXISTS idx_sellers_username ON sellers(username);

-- Audit log for administrative and critical actions
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'seller', 'customer', 'system')),
    actor_identifier TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_identifier TEXT NULL,
    metadata_json TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_type, actor_identifier);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);

-- Dynamic system settings key-value store
CREATE TABLE IF NOT EXISTS aep_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Default settings seed
INSERT OR IGNORE INTO aep_settings (key, value) VALUES
    ('event_name', 'GAMMS AEP'),
    ('event_active', 'true'),
    ('currency_code', 'NIO'),
    ('currency_symbol', 'C$'),
    ('claim_ttl_seconds', '300'),
    ('rewards_enabled', 'true'),
    ('reward_every_n_purchases', '3'),
    ('reward_discount_percent', '50'),
    ('allow_negative_stock', 'false'),
    ('timezone', 'America/Managua');

-- Performance indices for reporting and dashboard queries
CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_product_status ON qr_codes(product_id, status);
