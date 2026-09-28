PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_promotion_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    every_n_purchases INTEGER NOT NULL DEFAULT 3 CHECK (every_n_purchases >= 2),
    discount_percent INTEGER NOT NULL DEFAULT 50 CHECK (discount_percent BETWEEN 1 AND 100),
    repeat_cycle INTEGER NOT NULL DEFAULT 1 CHECK (repeat_cycle IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_promo_enabled
ON product_promotion_rules(enabled, product_id);

ALTER TABLE rewards ADD COLUMN product_id INTEGER REFERENCES products(id);
ALTER TABLE rewards ADD COLUMN promotion_rule_id INTEGER REFERENCES product_promotion_rules(id);
