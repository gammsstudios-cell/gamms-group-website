import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createAdminSession, buildAdminCookie } from "./adminAuth.js";
import { onRequestPost as voidPost } from "../api/admin/purchases/[id]/void.js";
import { normalizeVoidReason, voidPurchase } from "./voids.js";
import { registerPurchase } from "./purchases.js";
import { hashQrToken } from "./crypto.js";

class TestD1 {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(sql) {
    return new TestStatement(this.sqlite, sql);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN TRANSACTION;");
    try {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.executeBatch());
      }
      this.sqlite.exec("COMMIT;");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
    }
  }
}

class TestStatement {
  constructor(sqlite, sql) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params.map((param) => (param === undefined ? null : param));
    return this;
  }

  async run() {
    const info = this.sqlite.prepare(this.sql).run(...this.params);
    return { meta: { changes: info.changes } };
  }

  async first() {
    return this.sqlite.prepare(this.sql).get(...this.params) ?? null;
  }

  async all() {
    return { results: this.sqlite.prepare(this.sql).all(...this.params) };
  }

  async executeBatch() {
    let changes = 0;
    let results = [];
    if (this.sql.toUpperCase().includes("RETURNING")) {
      results = this.sqlite.prepare(this.sql).all(...this.params);
      changes = results.length;
    } else {
      const info = this.sqlite.prepare(this.sql).run(...this.params);
      changes = info.changes;
    }
    return { meta: { changes }, results };
  }
}

function migrationFiles() {
  const migrationsDir = resolve(process.cwd(), "database/migrations");
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(migrationsDir, file), "utf8") }));
}

function createFreshSqlite(upTo = "012") {
  const db = new DatabaseSync(":memory:");
  for (const { file, sql } of migrationFiles()) {
    if (file.slice(0, 3) <= upTo && sql.trim()) db.exec(sql);
  }
  return db;
}

function seedBaseData(db) {
  db.exec(`
    INSERT INTO products (id, name, price_cents, active, stock_quantity)
    VALUES (1, 'Bebida 1', 4000, 1, 100);

    INSERT INTO customers (id, display_name) VALUES ('cust-1', 'Juan Customer');

    INSERT INTO aep_users (id, username, username_normalized, display_name, password_hash)
    VALUES (7, 'ana', 'ana', 'Ana Staff', 'hash');
  `);
}

function insertPurchase(db, id, qrId, customerId = "cust-1", productId = 1, price = 4000, discount = 0) {
  db.exec(`
    INSERT INTO qr_codes (id, public_number, token_hash, product_id, status, used_at)
    VALUES (${qrId}, ${1000 + qrId}, 'hash_qr_${qrId}', ${productId}, 'used', CURRENT_TIMESTAMP);

    INSERT INTO purchases (id, customer_id, product_id, qr_code_id, regular_price_cents, discount_percent, final_price_cents)
    VALUES (${id}, '${customerId}', ${productId}, ${qrId}, ${price}, ${discount}, ${Math.round(price * (100 - discount) / 100)});
  `);
}

// 1. REASON TESTS (A, B, C)
test("A & B & C: Reason validation requires real string", () => {
  assert.equal(normalizeVoidReason({}).valid, false);
  assert.equal(normalizeVoidReason({}).code, "INVALID_VOID_REASON");
  assert.equal(normalizeVoidReason([]).valid, false);
  assert.equal(normalizeVoidReason([]).code, "INVALID_VOID_REASON");
  assert.equal(normalizeVoidReason(null).valid, false);
  assert.equal(normalizeVoidReason(123).valid, false);
  assert.equal(normalizeVoidReason("  ab  ").valid, false); // < 3 chars trimmed

  const valid = normalizeVoidReason("   Cliente solicito anulacion   ");
  assert.equal(valid.valid, true);
  assert.equal(valid.reason, "Cliente solicito anulacion");
});

// 2. D & E: ACTOR TESTS (Owner ENV vs Staff DB)
test("D & E: Void with Owner ENV and Staff DB actor", async () => {
  const sqlite = createFreshSqlite("012");
  seedBaseData(sqlite);
  insertPurchase(sqlite, 10, 1);

  const db = new TestD1(sqlite);

  // E: Staff DB void
  const resultStaff = await voidPurchase(db, { type: "staff", userId: "7", displayName: "Ana Staff" }, 10, "Error en marcacion POS");
  assert.equal(resultStaff.valid, true);

  const voidRowStaff = sqlite.prepare("SELECT * FROM purchase_voids WHERE purchase_id = 10").get();
  assert.equal(voidRowStaff.actor_type, "staff");
  assert.equal(voidRowStaff.voided_by_staff_id, 7);

  // D: Owner ENV void on another purchase
  insertPurchase(sqlite, 11, 2);
  const resultOwner = await voidPurchase(db, { isEnvOwner: true }, 11, "Anulacion por superusuario");
  assert.equal(resultOwner.valid, true);

  const voidRowOwner = sqlite.prepare("SELECT * FROM purchase_voids WHERE purchase_id = 11").get();
  assert.equal(voidRowOwner.actor_type, "owner_env");
  assert.equal(voidRowOwner.voided_by_staff_id, null);
  assert.equal(voidRowOwner.actor_ref, "env:admin");
});

// 3. F: ATOMICITY (Forced failure causes complete rollback)
test("F: Atomic void rolls back everything if a statement fails", async () => {
  const sqlite = createFreshSqlite("012");
  seedBaseData(sqlite);
  insertPurchase(sqlite, 20, 1);
  const stockBefore = sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity;

  const db = new TestD1(sqlite);

  // Pre-insert a void row manually so purchase_voids INSERT inside voidPurchase batch triggers PRIMARY KEY conflict
  sqlite.prepare("INSERT INTO purchase_voids (purchase_id, actor_type, voided_by_staff_id, reason) VALUES (20, 'staff', 7, 'Pre-existing')").run();

  // Now attempt voidPurchase
  const res = await voidPurchase(db, { type: "staff", userId: "7" }, 20, "Anulacion duplicada");
  assert.equal(res.valid, false);

  // Stock should NOT have changed because batch rolled back
  const stockAfter = sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity;
  assert.equal(stockAfter, stockBefore);
});

// 4. G: CONCURRENCY / DOUBLE VOID
test("G: Double void fails and stock is incremented only once", async () => {
  const sqlite = createFreshSqlite("012");
  seedBaseData(sqlite);
  insertPurchase(sqlite, 30, 1);
  const stockInitial = sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity;

  const db = new TestD1(sqlite);

  // First void succeeds
  const res1 = await voidPurchase(db, { type: "staff", userId: "7" }, 30, "Primera anulacion");
  assert.equal(res1.valid, true);
  const stockAfterFirst = sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity;
  assert.equal(stockAfterFirst, stockInitial + 1);

  // Second void fails
  const res2 = await voidPurchase(db, { type: "staff", userId: "7" }, 30, "Segunda anulacion");
  assert.equal(res2.valid, false);
  assert.equal(res2.error, "Esta compra ya fue anulada previamente");

  // Stock remains unchanged after second attempt
  const stockAfterSecond = sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity;
  assert.equal(stockAfterSecond, stockInitial + 1);
});

// 5. H: PURCHASE #4 VOID AFTER CYCLE 1 REWARD REDEEMED
test("H: Void purchase #4 when cycle 1 reward is redeemed does not confuse rewards", async () => {
  const sqlite = createFreshSqlite("012");
  seedBaseData(sqlite);

  // Cycle 1: purchase #1, #2 (generates reward #1), #3 (redeems reward #1)
  insertPurchase(sqlite, 1, 1);
  insertPurchase(sqlite, 2, 2);
  insertPurchase(sqlite, 3, 3, "cust-1", 1, 4000, 50);
  sqlite.prepare("INSERT INTO rewards (id, customer_id, reward_type, discount_percent, status, cycle_number, redeemed_purchase_id) VALUES (100, 'cust-1', 'third_drink_50', 50, 'redeemed', 1, 3)").run();

  // Cycle 2: purchase #4
  insertPurchase(sqlite, 4, 4);

  const db = new TestD1(sqlite);

  // Void purchase #4 (which did NOT create reward 100)
  const res = await voidPurchase(db, { type: "staff", userId: "7" }, 4, "Anular compra 4");
  assert.equal(res.valid, true);

  // Reward 100 should still be redeemed
  const rewardRow = sqlite.prepare("SELECT status FROM rewards WHERE id = 100").get();
  assert.equal(rewardRow.status, "redeemed");
});

// 6. I, J, K, L: CYCLE #2 VOID, REPLACEMENT, PROGRESS & CYCLE COUNT
test("I, J, K, L: Void purchase #2 cancels reward, replacement reactivates it, progress & cycle counts exclude voided", async () => {
  const sqlite = createFreshSqlite("012");
  seedBaseData(sqlite);

  // Customer makes purchase #1 and #2
  insertPurchase(sqlite, 1, 1);
  insertPurchase(sqlite, 2, 2);
  sqlite.prepare("INSERT INTO rewards (id, customer_id, reward_type, discount_percent, status, cycle_number) VALUES (1, 'cust-1', 'third_drink_50', 50, 'available', 1)").run();

  const db = new TestD1(sqlite);

  // I: Void purchase #2 -> reward cycle 1 is cancelled
  const resVoid = await voidPurchase(db, { type: "staff", userId: "7" }, 2, "Anular compra 2");
  assert.equal(resVoid.valid, true);

  const rewardCancelled = sqlite.prepare("SELECT status FROM rewards WHERE id = 1").get();
  assert.equal(rewardCancelled.status, "cancelled");

  // K & L: Non-voided purchase count is now 1
  const countRow = sqlite.prepare(`
    SELECT COUNT(*) as count FROM purchases p
    WHERE p.customer_id = 'cust-1' AND NOT EXISTS (SELECT 1 FROM purchase_voids pv WHERE pv.purchase_id = p.id)
  `).get();
  assert.equal(countRow.count, 1);

  // J: New physical purchase #3 (which acts as the new 2nd non-voided purchase)
  const rawToken = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const tokenHash = await hashQrToken(rawToken);
  sqlite.prepare(`INSERT INTO qr_codes (id, public_number, token_hash, product_id, status) VALUES (30, 1030, '${tokenHash}', 1, 'available')`).run();

  // Simulate registerPurchase for customer with new QR
  const regResult = await registerPurchase(db, new Request("https://example.com"), rawToken, {
    generateCustomerId: () => "cust-1"
  });
  assert.equal(regResult.ok, true);

  // Reward cycle 1 should now be REACTIVATED ('available')
  const rewardReactivated = sqlite.prepare("SELECT status FROM rewards WHERE id = 1").get();
  assert.equal(rewardReactivated.status, "available");
});

// 7. M: PURCHASE THAT REDEEMED A REWARD CANNOT BE VOIDED
test("M: Voiding a purchase that redeemed a reward is rejected", async () => {
  const sqlite = createFreshSqlite("012");
  seedBaseData(sqlite);

  insertPurchase(sqlite, 1, 1);
  insertPurchase(sqlite, 2, 2);
  insertPurchase(sqlite, 3, 3, "cust-1", 1, 4000, 50);
  sqlite.prepare("INSERT INTO rewards (id, customer_id, reward_type, discount_percent, status, cycle_number, redeemed_purchase_id) VALUES (50, 'cust-1', 'third_drink_50', 50, 'redeemed', 1, 3)").run();

  const db = new TestD1(sqlite);

  // Attempt to void purchase 3 (which redeemed reward 50)
  const res = await voidPurchase(db, { type: "staff", userId: "7" }, 3, "Intentar anular canje");
  assert.equal(res.valid, false);
  assert.equal(res.code, "VOID_LOYALTY_CONFLICT");
});

// 8. LATEST NON-VOIDED PURCHASE REQUIREMENT
test("Latest non-voided purchase check allows voiding head purchase sequentially", async () => {
  const sqlite = createFreshSqlite("012");
  seedBaseData(sqlite);

  insertPurchase(sqlite, 1, 1);
  insertPurchase(sqlite, 2, 2);

  const db = new TestD1(sqlite);

  // Cannot void purchase 1 when purchase 2 exists
  const res1 = await voidPurchase(db, { type: "staff", userId: "7" }, 1, "Intentar anular no-reciente");
  assert.equal(res1.valid, false);
  assert.equal(res1.code, "VOID_LOYALTY_CONFLICT");

  // Void purchase 2
  const res2 = await voidPurchase(db, { type: "staff", userId: "7" }, 2, "Anular compra 2 reciente");
  assert.equal(res2.valid, true);

  // Now purchase 1 IS the latest non-voided purchase, so it can be voided
  const res3 = await voidPurchase(db, { type: "staff", userId: "7" }, 1, "Anular compra 1 ahora reciente");
  assert.equal(res3.valid, true);
});

// 9. END-TO-END ADMIN HTTP ENDPOINT VOID TEST
test("Owner ENV authenticated through server-side admin session can void without a DB staff row", async () => {
  const sqlite = createFreshSqlite("012");
  seedBaseData(sqlite);
  insertPurchase(sqlite, 100, 10);

  const db = new TestD1(sqlite);
  const env = {
    DB: db,
    AEP_ADMIN_USERNAME: "owner",
    AEP_ADMIN_PASSCODE_HASH: "unused",
    AEP_ADMIN_SESSION_SECRET: "secret-for-test"
  };
  const session = await createAdminSession(env, "admin");
  const cookie = buildAdminCookie(session, { url: "https://example.com/aep/controlcenter" });

  const response = await voidPost({
    request: new Request("https://example.com/aep/api/admin/purchases/100/void", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        reason: "Cliente solicito anulacion",
        actor_type: "staff",
        voided_by_staff_id: 7,
        actor_ref: "cliente-no-controla-esto"
      })
    }),
    env,
    params: { id: "100" }
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);

  const rawVoidRow = sqlite.prepare("SELECT actor_type, voided_by_staff_id, actor_ref, reason FROM purchase_voids WHERE purchase_id = 100").get();
  assert.deepEqual({ ...rawVoidRow }, {
    actor_type: "owner_env",
    voided_by_staff_id: null,
    actor_ref: "env:admin",
    reason: "Cliente solicito anulacion"
  });
});
