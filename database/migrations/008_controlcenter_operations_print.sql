-- GAMMS AEP Phase 3.5: Control Center Operations and Print Center
-- This migration is intentionally additive. Do not edit applied migrations 001-007.

CREATE TABLE IF NOT EXISTS print_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  page_width_um INTEGER NOT NULL CHECK (page_width_um BETWEEN 100000 AND 500000),
  page_height_um INTEGER NOT NULL CHECK (page_height_um BETWEEN 100000 AND 500000),
  label_width_um INTEGER NOT NULL CHECK (label_width_um BETWEEN 5000 AND 150000),
  label_height_um INTEGER NOT NULL CHECK (label_height_um BETWEEN 5000 AND 150000),
  columns INTEGER NOT NULL CHECK (columns > 0),
  rows INTEGER NOT NULL CHECK (rows > 0),
  margin_top_um INTEGER NOT NULL DEFAULT 0 CHECK (margin_top_um BETWEEN 0 AND 100000),
  margin_right_um INTEGER NOT NULL DEFAULT 0 CHECK (margin_right_um BETWEEN 0 AND 100000),
  margin_bottom_um INTEGER NOT NULL DEFAULT 0 CHECK (margin_bottom_um BETWEEN 0 AND 100000),
  margin_left_um INTEGER NOT NULL DEFAULT 0 CHECK (margin_left_um BETWEEN 0 AND 100000),
  gap_x_um INTEGER NOT NULL DEFAULT 0 CHECK (gap_x_um BETWEEN 0 AND 50000),
  gap_y_um INTEGER NOT NULL DEFAULT 0 CHECK (gap_y_um BETWEEN 0 AND 50000),
  offset_x_um INTEGER NOT NULL DEFAULT 0 CHECK (offset_x_um BETWEEN -25000 AND 25000),
  offset_y_um INTEGER NOT NULL DEFAULT 0 CHECK (offset_y_um BETWEEN -25000 AND 25000),
  scale_x_bp INTEGER NOT NULL DEFAULT 10000 CHECK (scale_x_bp BETWEEN 8000 AND 12000),
  scale_y_bp INTEGER NOT NULL DEFAULT 10000 CHECK (scale_y_bp BETWEEN 8000 AND 12000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_profiles_single_default
ON print_profiles(is_default)
WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS qr_batches (
  id TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 500),
  first_public_number INTEGER NOT NULL CHECK (first_public_number > 0),
  last_public_number INTEGER NOT NULL
    CHECK (
      last_public_number >= first_public_number
      AND (last_public_number - first_public_number + 1) = quantity
    ),
  print_profile_id INTEGER,
  start_slot INTEGER NOT NULL DEFAULT 1 CHECK (start_slot > 0),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (print_profile_id) REFERENCES print_profiles(id)
);

CREATE TABLE IF NOT EXISTS qr_batch_items (
  batch_id TEXT NOT NULL,
  qr_code_id INTEGER NOT NULL,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id, sequence_number),
  UNIQUE (qr_code_id),
  FOREIGN KEY (batch_id) REFERENCES qr_batches(id),
  FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id)
);

CREATE INDEX IF NOT EXISTS idx_qr_batches_created_at ON qr_batches(created_at);
CREATE INDEX IF NOT EXISTS idx_qr_batches_product ON qr_batches(product_id);

INSERT OR IGNORE INTO print_profiles (
  name,
  page_width_um,
  page_height_um,
  label_width_um,
  label_height_um,
  columns,
  rows,
  margin_top_um,
  margin_right_um,
  margin_bottom_um,
  margin_left_um,
  gap_x_um,
  gap_y_um,
  offset_x_um,
  offset_y_um,
  scale_x_bp,
  scale_y_bp,
  active,
  is_default
) VALUES (
  'MACO ML-5000 - 50 etiquetas',
  215900,
  279400,
  38100,
  25400,
  5,
  10,
  12700,
  12700,
  12700,
  12700,
  0,
  0,
  0,
  0,
  10000,
  10000,
  1,
  1
);
