PRAGMA foreign_keys = ON;

-- Guarantee at most one 'sale' inventory movement per purchase_id to prevent duplicate stock deductions
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sale_purchase
ON inventory_movements(purchase_id)
WHERE movement_type = 'sale' AND purchase_id IS NOT NULL;
