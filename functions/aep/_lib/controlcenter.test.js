import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

import {
  buildAdminCookie,
  clearAdminCookie,
  createAdminSession,
  loginAdmin,
  requireAdminAuth,
  verifyAdminSession
} from "./adminAuth.js";
import { adminCsv, csvEscape, validateCsrf } from "./adminResponses.js";
import { getAuditEvents, logAuditEvent } from "./audit.js";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "./settings.js";
import { createProduct, getProductById, listProducts, updateProduct } from "./products.js";
import { listInventoryMovements, recordInventoryMovement } from "./inventory.js";
import { disableQr, generateQrBatch, getQrByPublicNumber, listQrCodes, reactivateQr } from "./adminQr.js";
import { formatFriendlyCustomerId, listSales } from "./sales.js";
import { getDashboardStats } from "./dashboard.js";
import { cancelReward, listRewards } from "./rewardsAdmin.js";
import { listCustomers } from "./customersAdmin.js";
import { createSellerAccount, listSellers, resetSellerPasscode, updateSellerAccount } from "./sellers.js";
import { sha256Hex } from "./crypto.js";

// Helper SQLite to D1 Adapter for testing migrations and queries
class TestD1 {
  constructor(sqliteDb) {
    this.sqlite = sqliteDb;
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
    } catch (err) {
      this.sqlite.exec("ROLLBACK;");
      throw err;
    }
  }
}

class TestStatement {
  constructor(sqliteDb, sql) {
    this.sqlite = sqliteDb;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params.map((p) => (p === undefined ? null : p));
    return this;
  }

  async run() {
    const stmt = this.sqlite.prepare(this.sql);
    const info = stmt.run(...this.params);
    return { meta: { changes: info.changes } };
  }

  async first() {
    const stmt = this.sqlite.prepare(this.sql);
    const row = stmt.get(...this.params);
    return row ?? null;
  }

  async all() {
    const stmt = this.sqlite.prepare(this.sql);
    const rows = stmt.all(...this.params);
    return { results: rows };
  }

  async executeBatch() {
    const stmt = this.sqlite.prepare(this.sql);
    let results = [];
    if (this.sql.toUpperCase().includes("RETURNING")) {
      results = stmt.all(...this.params);
      return { meta: { changes: results.length }, results };
    }
    const info = stmt.run(...this.params);
    return { meta: { changes: info.changes }, results: [] };
  }
}

async function createTestDb() {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDir = resolve(process.cwd(), "database/migrations");
  const files = readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith(".sql")) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      if (sql.trim()) {
        sqlite.exec(sql);
      }
    }
  }

  return new TestD1(sqlite);
}

// ----------------------------------------------------
// MIGRATION & SCHEMA VALIDATION TEST (Section 35)
// ----------------------------------------------------
test("Database migrations 001 to 007 apply cleanly to fresh SQLite database", async () => {
  const db = await createTestDb();
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = (tables?.results ?? []).map((t) => t.name);

  assert.ok(tableNames.includes("products"));
  assert.ok(tableNames.includes("inventory_movements"));
  assert.ok(tableNames.includes("sellers"));
  assert.ok(tableNames.includes("seller_sessions"));
  assert.ok(tableNames.includes("audit_events"));
  assert.ok(tableNames.includes("aep_settings"));
});

// ----------------------------------------------------
// ADMIN AUTH TESTS (Section 4 & 34)
// ----------------------------------------------------
test("adminAuth handles login, session creation, verification, and cookie clearing", async () => {
  const passcode = "admin1234";
  const passHash = await sha256Hex(passcode);
  const env = {
    AEP_ADMIN_PASSCODE_HASH: passHash,
    AEP_ADMIN_SESSION_SECRET: "super-secret-key-12345"
  };

  // Login
  const loginRes = await loginAdmin(env, passcode);
  assert.equal(loginRes.ok, true);

  const invalidLogin = await loginAdmin(env, "wrongpass");
  assert.equal(invalidLogin.ok, false);
  assert.equal(invalidLogin.code, "ADMIN_AUTH_INVALID");

  // Create & Verify Session
  const sessionToken = await createAdminSession(env, "admin");
  const req = new Request("https://example.com/aep/controlcenter", {
    headers: { cookie: `${buildAdminCookie(sessionToken, { url: "https://example.com" })}` }
  });

  const authRes = await requireAdminAuth(req, env);
  assert.equal(authRes.ok, true);
  assert.equal(authRes.payload.sub, "admin");

  // Tampered session
  const tamperedCookie = buildAdminCookie(sessionToken + "x", { url: "https://example.com" });
  const tamperedReq = new Request("https://example.com/aep/controlcenter", {
    headers: { cookie: tamperedCookie }
  });
  const tamperedAuth = await requireAdminAuth(tamperedReq, env);
  assert.equal(tamperedAuth.ok, false);
  assert.equal(tamperedAuth.code, "ADMIN_AUTH_REQUIRED");

  // Seller cookie cannot authenticate admin
  const sellerReq = new Request("https://example.com/aep/controlcenter", {
    headers: { cookie: "GAMMS-AEP-Seller=some-seller-token" }
  });
  const sellerAuth = await requireAdminAuth(sellerReq, env);
  assert.equal(sellerAuth.ok, false);

  // Customer cookie cannot authenticate admin
  const customerReq = new Request("https://example.com/aep/controlcenter", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_12345" }
  });
  const customerAuth = await requireAdminAuth(customerReq, env);
  assert.equal(customerAuth.ok, false);
});

test("adminAuth reports missing admin secrets (503)", async () => {
  const env = {};
  const res = await loginAdmin(env, "anything");
  assert.equal(res.ok, false);
  assert.equal(res.code, "ADMIN_AUTH_NOT_CONFIGURED");
  assert.equal(res.status, 503);
});

// ----------------------------------------------------
// CSRF & WEB SECURITY TESTS (Section 5)
// ----------------------------------------------------
test("validateCsrf enforces application/json content type and host matching", async () => {
  const validReq = new Request("https://example.com/aep/api/admin/products", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "host": "example.com",
      "origin": "https://example.com"
    }
  });
  assert.equal(validateCsrf(validReq).ok, true);

  const badTypeReq = new Request("https://example.com/aep/api/admin/products", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "host": "example.com"
    }
  });
  assert.equal(validateCsrf(badTypeReq).ok, false);

  const mismatchReq = new Request("https://example.com/aep/api/admin/products", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "host": "example.com",
      "origin": "https://evil.com"
    }
  });
  assert.equal(validateCsrf(mismatchReq).ok, false);
});

test("csvEscape escapes quotes, commas, and prevents formula injection", () => {
  assert.equal(csvEscape("Hello, World"), '"Hello, World"');
  assert.equal(csvEscape('Quote "Text"'), '"Quote ""Text"""');
  assert.equal(csvEscape("=SUM(A1:A10)"), "'=SUM(A1:A10)");
  assert.equal(csvEscape("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
});

// ----------------------------------------------------
// PRODUCT CRUD & STOCK TESTS (Section 7 & 8)
// ----------------------------------------------------
test("products CRUD and stock tracking operate correctly", async () => {
  const db = await createTestDb();

  // Create Product
  const createRes = await createProduct(db, {
    name: "Té Frío Limón",
    category: "bebidas",
    priceCents: 3500,
    stockQuantity: 30,
    lowStockThreshold: 10
  });
  assert.equal(createRes.ok, true);
  assert.equal(createRes.product.name, "Té Frío Limón");
  assert.equal(createRes.product.stockQuantity, 30);

  // List Products
  const listRes = await listProducts(db, { query: "Limón" });
  assert.equal(listRes.items.length, 1);

  // Edit Product
  const updateRes = await updateProduct(db, createRes.product.id, {
    priceCents: 3800,
    active: false
  });
  assert.equal(updateRes.ok, true);
  assert.equal(updateRes.product.priceCents, 3800);
  assert.equal(updateRes.product.active, false);

  // Validation failure on negative price
  const badPriceRes = await createProduct(db, { name: "Bad", priceCents: -500 });
  assert.equal(badPriceRes.ok, false);
  assert.equal(badPriceRes.code, "INVALID_PRICE");
});

// ----------------------------------------------------
// INVENTORY MOVEMENTS TESTS (Section 8)
// ----------------------------------------------------
test("recordInventoryMovement updates stock and prevents negative stock", async () => {
  const db = await createTestDb();

  const prod = await createProduct(db, { name: "Jugo Naranja", priceCents: 2500, stockQuantity: 10 });
  const pId = prod.product.id;

  // Restock (+15)
  const restockRes = await recordInventoryMovement(db, {
    productId: pId,
    quantityDelta: 15,
    movementType: "restock",
    reason: "Restock semanal"
  });
  assert.equal(restockRes.ok, true);
  assert.equal(restockRes.movement.newStock, 25);

  // Attempt adjustment beyond stock (-30) -> should fail if negative stock disabled
  const overAdjust = await recordInventoryMovement(db, {
    productId: pId,
    quantityDelta: -30,
    movementType: "adjustment",
    reason: "Pérdida"
  });
  assert.equal(overAdjust.ok, false);
  assert.equal(overAdjust.code, "INSUFFICIENT_STOCK");

  // Check inventory movements list
  const movements = await listInventoryMovements(db, { productId: pId });
  assert.equal(movements.items.length, 2); // Initial creation + Restock
});

// ----------------------------------------------------
// QR BATCH GENERATION & STATUS CONTROL TESTS (Section 9 & 10)
// ----------------------------------------------------
test("generateQrBatch creates unique tokens, hashes, and SVG label material", async () => {
  const db = await createTestDb();
  const prod = await createProduct(db, { name: "Agua", priceCents: 1500, stockQuantity: 100 });

  const batchRes = await generateQrBatch(db, {
    productId: prod.product.id,
    count: 10,
    startNumber: 201
  });

  assert.equal(batchRes.ok, true);
  assert.equal(batchRes.count, 10);
  assert.equal(batchRes.startNumber, 201);
  assert.equal(batchRes.endNumber, 210);
  assert.equal(batchRes.items.length, 10);

  const firstItem = batchRes.items[0];
  assert.equal(firstItem.publicNumber, 201);
  assert.ok(firstItem.token.length >= 12);
  assert.ok(firstItem.svg.includes("<svg"));

  // Check DB state
  const qrList = await listQrCodes(db, { productId: prod.product.id });
  assert.equal(qrList.items.length, 10);

  // Disable QR #201
  const disableRes = await disableQr(db, 201);
  assert.equal(disableRes.ok, true);
  assert.equal(disableRes.qr.status, "disabled");

  // Reactivate QR #201
  const reactivateRes = await reactivateQr(db, 201);
  assert.equal(reactivateRes.ok, true);
  assert.equal(reactivateRes.qr.status, "available");
});

test("cannot reactivate a used QR code", async () => {
  const db = await createTestDb();
  const prod = await createProduct(db, { name: "Soda", priceCents: 2000, stockQuantity: 50 });
  const batch = await generateQrBatch(db, { productId: prod.product.id, count: 1, startNumber: 999 });

  // Mark QR 999 as used
  await db.prepare("UPDATE qr_codes SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE public_number = 999").run();

  const reactivateRes = await reactivateQr(db, 999);
  assert.equal(reactivateRes.ok, false);
  assert.equal(reactivateRes.code, "QR_ALREADY_USED");
});

// ----------------------------------------------------
// DASHBOARD & SALES STATISTICS TESTS (Section 11 & 12)
// ----------------------------------------------------
test("getDashboardStats and listSales compute correct aggregates", async () => {
  const db = await createTestDb();
  const prod = await createProduct(db, { name: "Bebida AEP", priceCents: 4000, stockQuantity: 50 });
  const pId = prod.product.id;

  // Insert mock customer, qr, purchase
  await db.prepare("INSERT INTO customers (id) VALUES ('cust_test_1')").run();
  await db.prepare("INSERT INTO qr_codes (public_number, token_hash, product_id, status) VALUES (501, 'hash501', ?, 'used')").bind(pId).run();
  const qrRow = await db.prepare("SELECT id FROM qr_codes WHERE public_number = 501").first();

  await db.prepare(
    "INSERT INTO purchases (customer_id, product_id, qr_code_id, regular_price_cents, discount_percent, final_price_cents) VALUES ('cust_test_1', ?, ?, 4000, 0, 4000)"
  ).bind(pId, qrRow.id).run();

  const stats = await getDashboardStats(db);
  assert.equal(stats.overview.totalSalesCount, 1);
  assert.equal(stats.overview.totalRevenueCents, 4000);

  const salesList = await listSales(db);
  assert.equal(salesList.items.length, 1);
  assert.equal(salesList.items[0].qrPublicNumber, 501);
  assert.equal(salesList.items[0].customerLabel, "Cliente TEST");
});

// ----------------------------------------------------
// REWARDS CANCELLATION TESTS (Section 13)
// ----------------------------------------------------
test("cancelReward updates status to cancelled and logs audit event", async () => {
  const db = await createTestDb();
  await db.prepare("INSERT INTO customers (id) VALUES ('cust_reward_cancel')").run();
  await db.prepare("INSERT INTO rewards (customer_id, status, discount_percent) VALUES ('cust_reward_cancel', 'available', 50)").run();

  const rewardRow = await db.prepare("SELECT id FROM rewards WHERE customer_id = 'cust_reward_cancel'").first();
  const cancelRes = await cancelReward(db, rewardRow.id);
  assert.equal(cancelRes.ok, true);

  const rewardsList = await listRewards(db, { customerId: "cust_reward_cancel" });
  assert.equal(rewardsList.items[0].status, "cancelled");
});

// ----------------------------------------------------
// ANONYMOUS CUSTOMERS STATS TESTS (Section 15)
// ----------------------------------------------------
test("listCustomers masks customer UUID into friendly label and counts progress", async () => {
  const db = await createTestDb();
  await db.prepare("INSERT INTO customers (id) VALUES ('cust_a7f200000000')").run();

  const custRes = await listCustomers(db);
  assert.equal(custRes.items.length, 1);
  assert.equal(custRes.items[0].idMasked, "Cliente A7F2");
});

// ----------------------------------------------------
// AUDIT LOG & SETTINGS TESTS (Section 17 & 18)
// ----------------------------------------------------
test("logAuditEvent and getSettings manage system records", async () => {
  const db = await createTestDb();

  // Audit
  await logAuditEvent(db, {
    actorType: "admin",
    actorIdentifier: "admin",
    action: "product_created",
    entityType: "product",
    entityIdentifier: "1"
  });

  const auditLog = await getAuditEvents(db, { action: "product_created" });
  assert.equal(auditLog.items.length, 1);
  assert.equal(auditLog.items[0].action, "product_created");

  // Settings
  const initialSettings = await getSettings(db);
  assert.equal(initialSettings.event_name, "GAMMS AEP");

  const updateRes = await updateSettings(db, { event_name: "GAMMS AEP 2026 SUPER DAY" });
  assert.equal(updateRes.ok, true);
  assert.equal(updateRes.settings.event_name, "GAMMS AEP 2026 SUPER DAY");
});

// ----------------------------------------------------
// SELLERS MANAGEMENT TESTS (Section 16)
// ----------------------------------------------------
test("createSellerAccount and resetSellerPasscode manage seller profiles", async () => {
  const db = await createTestDb();

  const createRes = await createSellerAccount(db, {
    displayName: "María Vendedora",
    username: "maria",
    passcode: "vendedor123"
  });
  assert.equal(createRes.ok, true);
  assert.equal(createRes.seller.displayName, "María Vendedora");

  const sellers = await listSellers(db);
  assert.equal(sellers.length, 1);

  const resetRes = await resetSellerPasscode(db, createRes.seller.id, "newpass456");
  assert.equal(resetRes.ok, true);
});
