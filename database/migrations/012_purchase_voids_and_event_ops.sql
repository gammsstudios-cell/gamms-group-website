PRAGMA foreign_keys = ON;

-- Administrative purchase voids table
CREATE TABLE IF NOT EXISTS purchase_voids (
    purchase_id INTEGER PRIMARY KEY,
    voided_by_staff_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    voided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id),
    FOREIGN KEY (voided_by_staff_id) REFERENCES aep_users(id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_voids_by ON purchase_voids(voided_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_purchase_voids_at ON purchase_voids(voided_at DESC);

-- Additional system settings defaults
INSERT OR IGNORE INTO aep_settings (key, value) VALUES
    ('require_seller_shift', 'false'),
    ('customer_name_required', 'true'),
    ('staff_mfa_available', 'true');
