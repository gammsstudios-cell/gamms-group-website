PRAGMA foreign_keys = ON;

-- Administrative purchase voids table
CREATE TABLE IF NOT EXISTS purchase_voids (
    purchase_id INTEGER PRIMARY KEY,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'owner_env')),
    voided_by_staff_id INTEGER,
    actor_ref TEXT,
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
    voided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id),
    FOREIGN KEY (voided_by_staff_id) REFERENCES aep_users(id),
    CHECK (
        (
            actor_type = 'staff'
            AND voided_by_staff_id IS NOT NULL
            AND actor_ref IS NULL
        )
        OR
        (
            actor_type = 'owner_env'
            AND voided_by_staff_id IS NULL
            AND actor_ref = 'env:admin'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_purchase_voids_by ON purchase_voids(voided_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_purchase_voids_at ON purchase_voids(voided_at DESC);

-- Additional system settings defaults
INSERT OR IGNORE INTO aep_settings (key, value) VALUES
    ('require_seller_shift', 'false'),
    ('customer_name_required', 'true'),
    ('staff_mfa_available', 'true');
