import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

function createFreshDbWithMigrations(upTo = "011") {
  const db = new DatabaseSync(":memory:");
  const migrationsDir = resolve(process.cwd(), "database/migrations");
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    const prefix = file.substring(0, 3);
    if (prefix <= upTo) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      db.exec(sql);
    }
  }
  return db;
}

function setupUsersAndProducts(db) {
  db.exec(`
    INSERT INTO aep_users (id, username, username_normalized, display_name, password_hash)
    VALUES 
      (1, 'juan', 'juan', 'Juan Perez', 'hash1'),
      (2, 'pedro', 'pedro', 'Pedro Gomez', 'hash2');

    INSERT INTO products (id, name, price_cents, active, stock_quantity)
    VALUES (1, 'Bebida 1', 4000, 1, 100);

    INSERT INTO customers (id) VALUES ('customer-1');

    INSERT INTO qr_codes (id, public_number, token_hash, product_id, status)
    VALUES 
      (1, 1001, 'hash_qr1', 1, 'used'),
      (2, 1002, 'hash_qr2', 1, 'used'),
      (3, 1003, 'hash_qr3', 1, 'used');

    INSERT INTO purchases (id, customer_id, product_id, regular_price_cents, discount_percent, final_price_cents, qr_code_id)
    VALUES 
      (100, 'customer-1', 1, 4000, 0, 4000, 1),
      (101, 'customer-1', 1, 4000, 0, 4000, 2),
      (102, 'customer-1', 1, 4000, 0, 4000, 3);
  `);
}

test("Migration 011 - A: Juan starts open shift -> OK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`
    INSERT INTO staff_shifts (id, user_id, status, ended_at)
    VALUES (10, 1, 'open', NULL);
  `);

  const shift = db.prepare("SELECT * FROM staff_shifts WHERE id = 10").get();
  assert.ok(shift);
  assert.strictEqual(shift.status, "open");
  assert.strictEqual(shift.ended_at, null);
});

test("Migration 011 - B: Juan tries second open shift -> UNIQUE constraint failure", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`
    INSERT INTO staff_shifts (id, user_id, status, ended_at)
    VALUES (10, 1, 'open', NULL);
  `);

  assert.throws(() => {
    db.exec(`
      INSERT INTO staff_shifts (id, user_id, status, ended_at)
      VALUES (11, 1, 'open', NULL);
    `);
  }, /UNIQUE constraint failed/);
});

test("Migration 011 - C: Juan closes shift -> can start new open shift", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`
    INSERT INTO staff_shifts (id, user_id, status, ended_at)
    VALUES (10, 1, 'open', NULL);
  `);

  db.exec(`
    UPDATE staff_shifts
    SET status = 'closed', ended_at = '2026-01-01 12:00:00'
    WHERE id = 10;
  `);

  db.exec(`
    INSERT INTO staff_shifts (id, user_id, status, ended_at)
    VALUES (12, 1, 'open', NULL);
  `);

  const openShifts = db.prepare("SELECT * FROM staff_shifts WHERE user_id = 1 AND status = 'open'").all();
  assert.strictEqual(openShifts.length, 1);
  assert.strictEqual(openShifts[0].id, 12);
});

test("Migration 011 - D: status='open' + ended_at NOT NULL -> fails CHECK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  assert.throws(() => {
    db.exec(`
      INSERT INTO staff_shifts (id, user_id, status, ended_at)
      VALUES (13, 1, 'open', '2026-01-01 12:00:00');
    `);
  }, /CHECK constraint failed/);
});

test("Migration 011 - E: status='closed' + ended_at NULL -> fails CHECK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  assert.throws(() => {
    db.exec(`
      INSERT INTO staff_shifts (id, user_id, status, ended_at)
      VALUES (14, 1, 'closed', NULL);
    `);
  }, /CHECK constraint failed/);
});

test("Migration 011 - F: customer attribution (actor_type='customer', staff_user_id=NULL, shift_id=NULL) -> OK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`
    INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
    VALUES (100, NULL, NULL, 'customer');
  `);

  const attr = db.prepare("SELECT * FROM purchase_attribution WHERE purchase_id = 100").get();
  assert.ok(attr);
  assert.strictEqual(attr.actor_type, "customer");
});

test("Migration 011 - G: customer + staff_user_id -> fails CHECK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  assert.throws(() => {
    db.exec(`
      INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
      VALUES (100, 1, NULL, 'customer');
    `);
  }, /CHECK constraint failed/);
});

test("Migration 011 - H: customer + shift_id -> fails CHECK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`INSERT INTO staff_shifts (id, user_id, status, ended_at) VALUES (1, 1, 'open', NULL);`);

  assert.throws(() => {
    db.exec(`
      INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
      VALUES (100, NULL, 1, 'customer');
    `);
  }, /CHECK constraint failed/);
});

test("Migration 011 - I: staff + staff_user_id + shift_id=NULL -> OK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`
    INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
    VALUES (100, 1, NULL, 'staff');
  `);

  const attr = db.prepare("SELECT * FROM purchase_attribution WHERE purchase_id = 100").get();
  assert.ok(attr);
  assert.strictEqual(attr.staff_user_id, 1);
  assert.strictEqual(attr.shift_id, null);
});

test("Migration 011 - J: staff + staff_user_id + shift of SAME staff -> OK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`INSERT INTO staff_shifts (id, user_id, status, ended_at) VALUES (50, 1, 'open', NULL);`);

  db.exec(`
    INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
    VALUES (100, 1, 50, 'staff');
  `);

  const attr = db.prepare("SELECT * FROM purchase_attribution WHERE purchase_id = 100").get();
  assert.ok(attr);
  assert.strictEqual(attr.staff_user_id, 1);
  assert.strictEqual(attr.shift_id, 50);
});

test("Migration 011 - K: staff_user_id = Juan + shift_id = Pedro's shift -> FOREIGN KEY failure", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  // Pedro (user_id = 2) starts shift 50
  db.exec(`INSERT INTO staff_shifts (id, user_id, status, ended_at) VALUES (50, 2, 'open', NULL);`);

  // Juan (user_id = 1) tries to use Pedro's shift 50
  assert.throws(() => {
    db.exec(`
      INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
      VALUES (100, 1, 50, 'staff');
    `);
  }, /FOREIGN KEY constraint failed/);
});

test("Migration 011 - L: staff with staff_user_id NULL -> fails CHECK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  assert.throws(() => {
    db.exec(`
      INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
      VALUES (100, NULL, NULL, 'staff');
    `);
  }, /CHECK constraint failed/);
});

test("Migration 011 - M: system without staff/shift -> OK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`
    INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
    VALUES (100, NULL, NULL, 'system');
  `);

  const attr = db.prepare("SELECT * FROM purchase_attribution WHERE purchase_id = 100").get();
  assert.ok(attr);
  assert.strictEqual(attr.actor_type, "system");
});

test("Migration 011 - N: system with staff -> fails CHECK", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  assert.throws(() => {
    db.exec(`
      INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
      VALUES (100, 1, NULL, 'system');
    `);
  }, /CHECK constraint failed/);
});

test("Migration 011 - O: two purchase_attribution rows for same purchase_id -> fails PRIMARY KEY", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`
    INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
    VALUES (100, NULL, NULL, 'customer');
  `);

  assert.throws(() => {
    db.exec(`
      INSERT INTO purchase_attribution (purchase_id, staff_user_id, shift_id, actor_type)
      VALUES (100, NULL, NULL, 'customer');
    `);
  }, /UNIQUE constraint failed/);
});

test("Migration 011 - P: session token_hash duplicate -> fails UNIQUE", () => {
  const db = createFreshDbWithMigrations("011");
  setupUsersAndProducts(db);

  db.exec(`
    INSERT INTO aep_staff_sessions (id, user_id, token_hash, expires_at)
    VALUES ('sess-1', 1, 'hash_abc', '2026-01-01 12:00:00');
  `);

  assert.throws(() => {
    db.exec(`
      INSERT INTO aep_staff_sessions (id, user_id, token_hash, expires_at)
      VALUES ('sess-2', 1, 'hash_abc', '2026-01-01 12:00:00');
    `);
  }, /UNIQUE constraint failed/);
});

test("Migration 011 - Q: confirm no explicit redundant index idx_staff_sessions_token", () => {
  const db = createFreshDbWithMigrations("011");
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(r => r.name);
  assert.strictEqual(indexes.includes("idx_staff_sessions_token"), false);
});
