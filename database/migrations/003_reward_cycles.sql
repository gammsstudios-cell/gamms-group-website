PRAGMA foreign_keys = ON;

ALTER TABLE rewards
ADD COLUMN cycle_number INTEGER NOT NULL DEFAULT 1
CHECK (cycle_number >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rewards_customer_type_cycle
ON rewards(customer_id, reward_type, cycle_number);

CREATE INDEX IF NOT EXISTS idx_rewards_customer_available
ON rewards(customer_id, status, reward_type);
