import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

function createFreshDbWithMigrations(upToMigration = "010") {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDir = resolve(process.cwd(), "database/migrations");
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (file > `${upToMigration}_` && !file.startsWith(upToMigration)) {
      break;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    sqlite.exec(sql);
  }
  return sqlite;
}

function runMigrations(sqlite, startFrom = "001", upTo = "010") {
  const migrationsDir = resolve(process.cwd(), "database/migrations");
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    const prefix = file.substring(0, 3);
    if (prefix >= startFrom && prefix <= upTo) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      sqlite.exec(sql);
    }
  }
}

test("Migration 010 - A: Legacy seller 'juan' is preserved and receives Vendedor role once", () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db, "001", "008");

  // Insert seller with username 'juan'
  db.exec(`
    INSERT INTO sellers (id, username, display_name, passcode_hash, active, created_at, last_login_at)
    VALUES (1, 'juan', 'Juan Pérez', 'hash_juan_123', 1, '2026-01-01 10:00:00', NULL);
  `);

  runMigrations(db, "009", "010");

  const user = db.prepare("SELECT * FROM aep_users WHERE username = 'juan'").get();
  assert.ok(user);
  assert.strictEqual(user.username_normalized, "juan");
  assert.strictEqual(user.password_hash, "hash_juan_123");
  assert.strictEqual(user.password_algo, "sha256");

  const roles = db.prepare("SELECT role_id FROM aep_user_roles WHERE user_id = ?").all(user.id);
  assert.strictEqual(roles.length, 1);
  assert.strictEqual(roles[0].role_id, 5); // Vendedor
});

test("Migration 010 - B: Uppercase username 'Juan' normalizes to 'juan'", () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db, "001", "008");

  db.exec(`
    INSERT INTO sellers (id, username, display_name, passcode_hash, active)
    VALUES (2, 'Juan', 'Juan Gomez', 'hash_juan_gomez', 1);
  `);

  runMigrations(db, "009", "010");

  const user = db.prepare("SELECT * FROM aep_users WHERE username = 'Juan'").get();
  assert.ok(user);
  assert.strictEqual(user.username_normalized, "juan");
});

test("Migration 010 - C: Seller without username defaults to seller_<id>", () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db, "001", "008");

  db.exec(`
    INSERT INTO sellers (id, username, display_name, passcode_hash, active)
    VALUES (42, NULL, 'Vendedor 42', 'hash_seller_42', 1);
  `);

  runMigrations(db, "009", "010");

  const user = db.prepare("SELECT * FROM aep_users WHERE id = 1").get();
  assert.ok(user);
  assert.strictEqual(user.username, "seller_42");
  assert.strictEqual(user.username_normalized, "seller_42");
});

test("Migration 010 - D: Two sellers with same display_name but different usernames migrate independently", () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db, "001", "008");

  db.exec(`
    INSERT INTO sellers (id, username, display_name, passcode_hash, active)
    VALUES 
      (10, 'carlos1', 'Carlos Lopez', 'hash_carlos1', 1),
      (11, 'carlos2', 'Carlos Lopez', 'hash_carlos2', 1);
  `);

  runMigrations(db, "009", "010");

  const users = db.prepare("SELECT * FROM aep_users ORDER BY id ASC").all();
  assert.strictEqual(users.length, 2);

  const roles = db.prepare("SELECT * FROM aep_user_roles ORDER BY user_id ASC").all();
  assert.strictEqual(roles.length, 2);
  assert.strictEqual(roles[0].role_id, 5);
  assert.strictEqual(roles[1].role_id, 5);
});

test("Migration 010 - E: Two sellers with same display_name and same passcode_hash but different usernames link correctly", () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db, "001", "008");

  db.exec(`
    INSERT INTO sellers (id, username, display_name, passcode_hash, active)
    VALUES 
      (20, 'pedro_a', 'Pedro R', 'same_hash_123', 1),
      (21, 'pedro_b', 'Pedro R', 'same_hash_123', 1);
  `);

  runMigrations(db, "009", "010");

  const users = db.prepare("SELECT * FROM aep_users ORDER BY id ASC").all();
  assert.strictEqual(users.length, 2);

  const roles = db.prepare("SELECT * FROM aep_user_roles ORDER BY user_id ASC").all();
  assert.strictEqual(roles.length, 2);
  assert.strictEqual(roles[0].user_id, users[0].id);
  assert.strictEqual(roles[1].user_id, users[1].id);
});

test("Migration 010 - F: Case-insensitive username collision ('Juan' and 'juan') FAILS migration", () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db, "001", "008");

  db.exec(`
    INSERT INTO sellers (id, username, display_name, passcode_hash, active)
    VALUES 
      (1, 'Juan', 'Juan A', 'hash_a', 1),
      (2, 'juan', 'Juan B', 'hash_b', 1);
  `);

  assert.throws(() => {
    runMigrations(db, "009", "010");
  }, /UNIQUE constraint failed/);
});

test("Migration 010 - G: Administrador role permissions check", () => {
  const db = createFreshDbWithMigrations("010");

  const adminPerms = db.prepare(`
    SELECT permission_key FROM aep_role_permissions WHERE role_id = 3
  `).all().map(r => r.permission_key);

  assert.ok(adminPerms.includes("users.manage"));
  assert.ok(adminPerms.includes("roles.manage"));
  assert.strictEqual(adminPerms.includes("system.manage"), false);
  assert.strictEqual(adminPerms.includes("security.mfa.manage"), false);
});

test("Migration 010 - H: Owner role has all permissions", () => {
  const db = createFreshDbWithMigrations("010");

  const totalPerms = db.prepare("SELECT COUNT(*) as count FROM aep_permissions").get().count;
  const ownerPerms = db.prepare("SELECT COUNT(*) as count FROM aep_role_permissions WHERE role_id = 1").get().count;

  assert.strictEqual(ownerPerms, totalPerms);
  assert.ok(ownerPerms >= 38);
});
