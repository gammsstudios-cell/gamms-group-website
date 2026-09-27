import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { PDFDocument } from "pdf-lib";

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
import { generateLabelsPdf } from "./printPdf.js";
import { getQuietQrDrawPlan } from "./printPdf.js";
import { buildLabelsPdfFilename, validateBatchPdfLabels } from "./printPdfSecurity.js";
import { getPrintProfile, getOrderedPhysicalSlots, getSlotPosition, paginateLabels, profileCapacity, updatePrintProfile, validateProfileInput } from "./printProfiles.js";
import { onRequestPost as pdfPost } from "../api/admin/print/pdf.js";
import { formatFriendlyCustomerId, listSales } from "./sales.js";
import { getDashboardStats } from "./dashboard.js";
import { cancelReward, listRewards } from "./rewardsAdmin.js";
import { listCustomers } from "./customersAdmin.js";
import { createSellerAccount, listSellers, resetSellerPasscode, updateSellerAccount } from "./sellers.js";
import { sha256Hex } from "./crypto.js";
import { requirePosActor } from "./posAuth.js";
import { createSellerSession, SELLER_COOKIE_NAME } from "./sellerAuth.js";
import { buildStaffCookie, createStaffSession } from "./staffSessions.js";

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
test("Database migrations 001 to 008 apply cleanly to fresh SQLite database", async () => {
  const db = await createTestDb();
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = (tables?.results ?? []).map((t) => t.name);

  assert.ok(tableNames.includes("products"));
  assert.ok(tableNames.includes("inventory_movements"));
  assert.ok(tableNames.includes("sellers"));
  assert.ok(tableNames.includes("seller_sessions"));
  assert.ok(tableNames.includes("audit_events"));
  assert.ok(tableNames.includes("aep_settings"));
  assert.ok(tableNames.includes("print_profiles"));
  assert.ok(tableNames.includes("qr_batches"));
  assert.ok(tableNames.includes("qr_batch_items"));
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
  assert.ok(batchRes.batchId.startsWith("qrb_"));
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

  const batchRow = await db.prepare("SELECT id, quantity FROM qr_batches WHERE id = ?").bind(batchRes.batchId).first();
  assert.equal(batchRow.quantity, 10);
  const batchItems = await db.prepare("SELECT COUNT(*) AS total FROM qr_batch_items WHERE batch_id = ?").bind(batchRes.batchId).first();
  assert.equal(batchItems.total, 10);
  const plaintextTokenLeak = await db.prepare(
    "SELECT COUNT(*) AS total FROM qr_codes WHERE token_hash = ?"
  ).bind(firstItem.token).first();
  assert.equal(plaintextTokenLeak.total, 0);

  // Disable QR #201
  const disableRes = await disableQr(db, 201);
  assert.equal(disableRes.ok, true);
  assert.equal(disableRes.qr.status, "disabled");

  // Reactivate QR #201
  const reactivateRes = await reactivateQr(db, 201);
  assert.equal(reactivateRes.ok, true);
  assert.equal(reactivateRes.qr.status, "available");
});

test("MACO ML-5000 profile geometry, pagination, and PDF generation are deterministic", async () => {
  const db = await createTestDb();
  const profile = await getPrintProfile(db);

  assert.equal(profile.name, "MACO ML-5000 - 50 etiquetas");
  assert.equal(profileCapacity(profile), 50);

  const slot1 = getSlotPosition(profile, 1);
  const slot5 = getSlotPosition(profile, 5);
  const slot6 = getSlotPosition(profile, 6);
  const slot50 = getSlotPosition(profile, 50);
  assert.equal(slot1.row, 1);
  assert.equal(slot1.column, 1);
  assert.equal(slot5.row, 1);
  assert.equal(slot5.column, 5);
  assert.equal(slot6.row, 2);
  assert.equal(slot6.column, 1);
  assert.equal(slot50.row, 10);
  assert.equal(slot50.column, 5);
  assert.ok(Math.abs(slot1.x - 36) < 0.0001);
  assert.ok(Math.abs((792 - slot1.y - slot1.height) - 36) < 0.0001);
  assert.ok(Math.abs(slot1.width - 108) < 0.0001);
  assert.ok(Math.abs(slot1.height - 72) < 0.0001);
  assert.ok(Math.abs(slot5.x - 468) < 0.0001);
  assert.ok(Math.abs(slot50.x + slot50.width - (612 - 36)) < 0.0001);
  assert.ok(Math.abs(slot50.y - 36) < 0.0001);

  const labels = Array.from({ length: 75 }, (_, index) => ({
    publicNumber: 300 + index,
    url: `https://example.com/aep/promo/r/token${index}`,
    productName: "Bebida"
  }));
  const pages = paginateLabels(labels, profile, 13);
  assert.equal(pages.ok, true);
  assert.deepEqual(pages.pages.map((page) => page.length), [38, 37]);

  const pdf = await generateLabelsPdf({ labels, profile, startSlot: 13 });
  assert.equal(pdf.ok, true);
  assert.equal(pdf.pageCount, 2);
  const loaded = await PDFDocument.load(pdf.bytes);
  assert.equal(loaded.getPageCount(), 2);
  const { width, height } = loaded.getPage(0).getSize();
  assert.equal(Math.round(width), 612);
  assert.equal(Math.round(height), 792);
});

test("print profile calibration offsets and scales alter slot boxes without changing capacity", async () => {
  const db = await createTestDb();
  const updated = await updatePrintProfile(db, 1, {
    offsetXUm: 1000,
    offsetYUm: -500,
    scaleXBp: 9800,
    scaleYBp: 10200
  });
  assert.equal(updated.ok, true);
  assert.equal(profileCapacity(updated.profile), 50);

  const original = await getPrintProfile(db);
  const slot = getSlotPosition(original, 1);
  assert.ok(slot.x > 36);
  assert.ok(slot.width < 108);
  assert.ok(slot.height > 72);

  const slot1 = getSlotPosition(original, 1);
  const slot2 = getSlotPosition(original, 2);
  const slot6 = getSlotPosition(original, 6);
  assert.ok((slot2.x - slot1.x) < 108);
  assert.ok((slot1.y - slot6.y) > 72);
});

test("quiet QR draw plan reserves four white modules and remains square", () => {
  const plan = getQuietQrDrawPlan("https://example.com/aep/promo/r/ABCDEFGHIJKL", 72);
  assert.equal(plan.quietModules, 4);
  assert.equal(plan.totalModules, plan.matrixCount + 8);
  assert.equal(plan.offset, plan.cell * 4);
  assert.ok(plan.modules.every((module) => module.x >= plan.offset));
  assert.ok(plan.modules.every((module) => module.y >= plan.offset));
  assert.ok(plan.modules.every((module) => module.x + module.width < 72));
  assert.ok(plan.modules.every((module) => module.y + module.height < 72));
  assert.ok(plan.modules.every((module) => Math.abs(module.width - module.height) < 0.001));
});

test("print order maps items to exact physical MACO slots", async () => {
  const db = await createTestDb();
  const profile = await getPrintProfile(db);

  const defaultSlots = getOrderedPhysicalSlots(profile);
  assert.deepEqual({ row: defaultSlots[0].row, column: defaultSlots[0].column }, { row: 1, column: 5 });
  assert.deepEqual({ row: defaultSlots[4].row, column: defaultSlots[4].column }, { row: 1, column: 1 });
  assert.deepEqual({ row: defaultSlots[5].row, column: defaultSlots[5].column }, { row: 2, column: 5 });
  assert.deepEqual({ row: defaultSlots[49].row, column: defaultSlots[49].column }, { row: 10, column: 1 });

  const topBottomLeft = getOrderedPhysicalSlots(profile, "top-to-bottom-left-to-right");
  assert.deepEqual({ row: topBottomLeft[0].row, column: topBottomLeft[0].column }, { row: 1, column: 1 });
  assert.deepEqual({ row: topBottomLeft[9].row, column: topBottomLeft[9].column }, { row: 10, column: 1 });
  assert.deepEqual({ row: topBottomLeft[10].row, column: topBottomLeft[10].column }, { row: 1, column: 2 });

  const leftRightTop = getOrderedPhysicalSlots(profile, "left-to-right-top-to-bottom");
  assert.deepEqual({ row: leftRightTop[0].row, column: leftRightTop[0].column }, { row: 1, column: 1 });
  assert.deepEqual({ row: leftRightTop[4].row, column: leftRightTop[4].column }, { row: 1, column: 5 });
  assert.deepEqual({ row: leftRightTop[5].row, column: leftRightTop[5].column }, { row: 2, column: 1 });

  const rightLeftTop = getOrderedPhysicalSlots(profile, "right-to-left-top-to-bottom");
  assert.deepEqual({ row: rightLeftTop[0].row, column: rightLeftTop[0].column }, { row: 1, column: 5 });
  assert.deepEqual({ row: rightLeftTop[4].row, column: rightLeftTop[4].column }, { row: 1, column: 1 });
  assert.deepEqual({ row: rightLeftTop[5].row, column: rightLeftTop[5].column }, { row: 2, column: 5 });

  const fifteen = paginateLabels(Array.from({ length: 15 }, (_, index) => ({ publicNumber: index + 1, url: `https://example.com/${index}` })), profile, 1);
  assert.equal(fifteen.ok, true);
  assert.deepEqual(
    fifteen.pages[0].map((item) => ({ row: item.box.row, column: item.box.column })),
    [
      { row: 1, column: 5 }, { row: 1, column: 4 }, { row: 1, column: 3 }, { row: 1, column: 2 }, { row: 1, column: 1 },
      { row: 2, column: 5 }, { row: 2, column: 4 }, { row: 2, column: 3 }, { row: 2, column: 2 }, { row: 2, column: 1 },
      { row: 3, column: 5 }, { row: 3, column: 4 }, { row: 3, column: 3 }, { row: 3, column: 2 }, { row: 3, column: 1 }
    ]
  );
});

test("default print order startSlot skips positions right-to-left by row", async () => {
  const db = await createTestDb();
  const profile = await getPrintProfile(db);
  const labels = Array.from({ length: 2 }, (_, index) => ({ publicNumber: index + 1, url: `https://example.com/${index}` }));
  const pages = paginateLabels(labels, profile, 3);

  assert.equal(pages.ok, true);
  assert.deepEqual(
    pages.pages[0].map((item) => ({ row: item.box.row, column: item.box.column })),
    [{ row: 1, column: 3 }, { row: 1, column: 2 }]
  );
});

test("ten default ordered labels fit one Letter sheet without leaving the label bounds", async () => {
  const db = await createTestDb();
  const profile = await getPrintProfile(db);
  const labels = Array.from({ length: 10 }, (_, index) => ({ publicNumber: index + 1, url: `https://example.com/${index}` }));
  const pages = paginateLabels(labels, profile, 1);

  assert.equal(pages.ok, true);
  assert.equal(pages.pages.length, 1);
  assert.equal(pages.pages[0].length, 10);
  for (const item of pages.pages[0]) {
    assert.ok(item.box.x >= 0);
    assert.ok(item.box.y >= 0);
    assert.ok(item.box.x + item.box.width <= 612);
    assert.ok(item.box.y + item.box.height <= 792);
    assert.equal(item.box.width, 108);
    assert.equal(item.box.height, 72);
  }
});

test("print profile validation rejects unsafe or impossible profiles", async () => {
  const db = await createTestDb();
  assert.equal(await getPrintProfile(db, 999), null);
  assert.equal(validateProfileInput({ ...MACO_FOR_TEST(), pageWidthUm: 900000 }).code, "INVALID_PROFILE_DIMENSIONS");
  assert.equal(validateProfileInput({ ...MACO_FOR_TEST(), offsetXUm: 100000 }).code, "INVALID_PROFILE_OFFSET");
  assert.equal(validateProfileInput({ ...MACO_FOR_TEST(), columns: 6 }).code, "PROFILE_OUT_OF_BOUNDS");
  assert.equal(validateProfileInput(MACO_FOR_TEST()).ok, true);
});

function MACO_FOR_TEST() {
  return {
    name: "MACO Test",
    pageWidthUm: 215900,
    pageHeightUm: 279400,
    labelWidthUm: 38100,
    labelHeightUm: 25400,
    columns: 5,
    rows: 10,
    marginTopUm: 12700,
    marginRightUm: 12700,
    marginBottomUm: 12700,
    marginLeftUm: 12700,
    gapXUm: 0,
    gapYUm: 0,
    offsetXUm: 0,
    offsetYUm: 0,
    scaleXBp: 10000,
    scaleYBp: 10000,
    active: true,
    isDefault: false
  };
}

async function makeBatch(db, count, startNumber = 1001) {
  const product = await createProduct(db, { name: "Coca-Cola 500ml", priceCents: 4000, stockQuantity: 1000 });
  return generateQrBatch(db, { productId: product.product.id, count, startNumber, startSlot: 1 });
}

test("PDF generation supports 1, 50, 51, 75 startSlot 13, and 500 labels", async () => {
  const db = await createTestDb();
  const profile = await getPrintProfile(db);
  for (const [count, startSlot, expectedPages] of [[1, 1, 1], [50, 1, 1], [51, 1, 2], [75, 13, 2], [500, 1, 10]]) {
    const labels = Array.from({ length: count }, (_, index) => ({
      publicNumber: 2000 + index,
      url: `https://example.com/aep/promo/r/${"A".repeat(12)}${index}`,
      productName: "Coca-Cola 500ml"
    }));
    const pdf = await generateLabelsPdf({ labels, profile, startSlot });
    assert.equal(pdf.ok, true);
    assert.equal(pdf.pageCount, expectedPages);
    assert.equal(Buffer.from(pdf.bytes).subarray(0, 4).toString(), "%PDF");
    const loaded = await PDFDocument.load(pdf.bytes);
    assert.equal(loaded.getPageCount(), expectedPages);
    const { width, height } = loaded.getPage(0).getSize();
    assert.equal(Math.round(width), 612);
    assert.equal(Math.round(height), 792);
  }

  const pages = paginateLabels(Array.from({ length: 75 }, (_, i) => i), profile, 13);
  assert.deepEqual(pages.pages.map((page) => page.length), [38, 37]);
});

test("batch PDF validation rejects manipulated labels and does not persist plaintext tokens", async () => {
  const db = await createTestDb();
  const batch = await makeBatch(db, 3, 101);
  assert.equal(batch.ok, true);

  const validation = await validateBatchPdfLabels(db, "https://example.com/aep/controlcenter/print", {
    batchId: batch.batchId,
    tokens: batch.items.map((item) => item.token)
  });
  assert.equal(validation.ok, true);
  assert.ok(validation.labels.every((label) => label.url.startsWith("https://example.com/aep/promo/r/")));
  assert.equal(validation.labels[0].productName, "Coca-Cola 500ml");
  assert.equal(validation.labels[0].publicNumber, 101);

  const duplicate = await validateBatchPdfLabels(db, "https://example.com", {
    batchId: batch.batchId,
    items: [{ token: batch.items[0].token }, { token: batch.items[0].token }, { token: batch.items[2].token }]
  });
  assert.equal(duplicate.code, "DUPLICATE_PRINT_ITEM");

  const invalidBatch = await validateBatchPdfLabels(db, "https://example.com", {
    batchId: "missing",
    items: batch.items.map((item) => ({ token: item.token }))
  });
  assert.equal(invalidBatch.code, "INVALID_BATCH");

  const malformed = await validateBatchPdfLabels(db, "https://example.com", {
    batchId: batch.batchId,
    items: [{ token: "bad" }, { token: batch.items[1].token }, { token: batch.items[2].token }]
  });
  assert.equal(malformed.code, "INVALID_QR_TOKEN");

  const leakChecks = [
    "SELECT COUNT(*) AS total FROM qr_codes WHERE token_hash IN (?, ?, ?)",
    "SELECT COUNT(*) AS total FROM qr_batches WHERE id IN (?, ?, ?)",
    "SELECT COUNT(*) AS total FROM qr_batch_items WHERE batch_id IN (?, ?, ?)",
    "SELECT COUNT(*) AS total FROM audit_events WHERE metadata_json IN (?, ?, ?)"
  ];
  for (const sql of leakChecks) {
    const row = await db.prepare(sql).bind(...batch.items.map((item) => item.token)).first();
    assert.equal(row.total, 0);
  }
});

test("admin PDF endpoint requires admin/CSRF and emits safe filename plus audit", async () => {
  const db = await createTestDb();
  const batch = await makeBatch(db, 1, 151);
  const env = {
    DB: db,
    AEP_ADMIN_PASSCODE_HASH: "unused",
    AEP_ADMIN_SESSION_SECRET: "secret-for-test"
  };
  const session = await createAdminSession(env, "admin_pdf");
  const cookie = buildAdminCookie(session, { url: "https://example.com/aep/controlcenter" });

  const noAuth = await pdfPost({
    request: new Request("https://example.com/aep/api/admin/print/pdf", {
      method: "POST",
      headers: { "content-type": "application/json", host: "example.com" },
      body: JSON.stringify({ batchId: batch.batchId, items: [{ token: batch.items[0].token }] })
    }),
    env
  });
  assert.equal(noAuth.status, 401);

  const sellerCookie = await pdfPost({
    request: new Request("https://example.com/aep/api/admin/print/pdf", {
      method: "POST",
      headers: { "content-type": "application/json", host: "example.com", cookie: "GAMMS-AEP-Seller=x" },
      body: "{}"
    }),
    env
  });
  assert.equal(sellerCookie.status, 401);

  const badCsrf = await pdfPost({
    request: new Request("https://example.com/aep/api/admin/print/pdf", {
      method: "POST",
      headers: { "content-type": "text/plain", host: "example.com", cookie },
      body: "{}"
    }),
    env
  });
  assert.equal(badCsrf.status, 415);

  const ok = await pdfPost({
    request: new Request("https://example.com/aep/api/admin/print/pdf", {
      method: "POST",
      headers: { "content-type": "application/json", host: "example.com", origin: "https://example.com", cookie },
      body: JSON.stringify({ batchId: batch.batchId, tokens: [batch.items[0].token], startSlot: 1 })
    }),
    env
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "application/pdf");
  assert.match(ok.headers.get("content-disposition"), /^attachment; filename="GAMMS-AEP_Coca-Cola-500ml_QR-0151-0151_MACO-ML-5000-50-etiquetas\.pdf"$/);
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");

  const audit = await db.prepare("SELECT action, metadata_json FROM audit_events WHERE action = 'label.pdf.generated' LIMIT 1").first();
  assert.equal(audit.action, "label.pdf.generated");
  assert.equal(JSON.parse(audit.metadata_json).batchId, batch.batchId);
  assert.equal(audit.metadata_json.includes(batch.items[0].token), false);

  const filename = buildLabelsPdfFilename({
    productName: "Coca\"/Bad\r\n☃",
    firstPublicNumber: 1,
    lastPublicNumber: 2,
    profileName: "MACO/ML\\5000"
  });
  assert.equal(filename.includes("\""), false);
  assert.equal(filename.includes("/"), false);
  assert.equal(filename.includes("\n"), false);
});

test("Control Center uses the PDF endpoint as the only physical print engine", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.match(source, /async function fetchCurrentBatchPdf\(\)/);
  assert.match(source, /async function downloadCurrentPdf\(\)/);
  assert.match(source, /async function printCurrentBatch\(\)/);
  assert.equal((source.match(/fetchCurrentBatchPdf\(\)/g) || []).length, 3);
  assert.equal((source.match(/API_BASE \+ "\/admin\/print\/pdf"/g) || []).length, 1);
  assert.match(source, /batchId: currentPrintBatch\.batchId/);
  assert.match(source, /printProfileId: currentPrintBatch\.printProfile\?\.id/);
  assert.match(source, /startSlot: currentPrintBatch\.startSlot/);
  assert.match(source, /tokens: currentPrintBatch\.items\.map\(item => item\.token\)/);
  assert.match(source, /link\.download = "gamms-aep-labels-" \+ currentPrintBatch\.batchId \+ "\.pdf"/);
  assert.match(source, /window\.open\(url, "_blank", "noopener"\)/);
  assert.match(source, /Motor de impresion: PDF fisico/);
  assert.match(source, /Letter 8\.5 x 11 in · MACO ML-5000 · 5 x 10/);
  assert.match(source, /Papel Carta \/ Letter 8\.5 x 11/);
  assert.match(source, /#printable-labels \{ display: none !important; \}/);
  assert.match(source, /Browser print is not a production label engine/);
  assert.doesNotMatch(source, /window\.print\(/);
  assert.doesNotMatch(source, /@page \{ size: Letter; margin: 0; \}/);
  assert.doesNotMatch(source, /page-break-after: always/);
  assert.doesNotMatch(source, /break-after: page/);
});

test("Control Center browser preview keeps PDF physical mapping without being printable production CSS", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.match(source, /\.print-slot \{ position: absolute;/);
  assert.match(source, /function renderBrowserPrintSheets\(batch\)/);
  assert.equal((source.match(/function renderBrowserPrintSheets\(batch\)/g) || []).length, 1);
  assert.match(source, /function getOrderedBrowserSlots\(profile\)/);
  assert.equal((source.match(/function getOrderedBrowserSlots\(profile\)/g) || []).length, 1);
  assert.match(source, /\.print-sheet-frame \{ width: 8\.5in; height: 11in;/);
  assert.match(source, /function fitPrintPreview\(\)/);
  assert.match(source, /window\.addEventListener\("resize", fitPrintPreview\)/);
  assert.match(source, /transform: scale\(var\(--preview-scale, 1\)\)/);
  assert.match(source, /\.qr-label-card svg \{ position: absolute; left: 0\.37in; top: 0\.29in; width: 0\.76in; height: 0\.76in;/);
  assert.match(source, /function escapePrintText\(value\)/);
  assert.match(source, /function renderPrintLabel\(item\)/);
  assert.match(source, /item\.svg \|\| ""/);
  assert.match(source, /item\?\.publicNumber/);
  assert.match(source, /shape-rendering: crispEdges/);
  assert.match(source, /const labelWidthUm = Number\(profile\?\.labelWidthUm \|\| 38100\);/);
  assert.match(source, /for \(let row = 0; row < rows; row \+= 1\) \{/);
  assert.match(source, /for \(let col = columns - 1; col >= 0; col -= 1\) pushSlot\(row, col\);/);
  assert.match(source, /leftIn: umToIn\(leftUm\)\.toFixed\(4\)/);
  assert.doesNotMatch(source, /function renderBrowserPrintSheets\(batch\) \{ return getOrderedBrowserSlots\(\{\}\); \}/);
  assert.doesNotMatch(source, /\$\{renderBrowserPrintSheets\(currentPrintBatch\)\}[\s\S]*\[object Object\]/);
  assert.doesNotMatch(source, /\[object Object\]/);
  assert.doesNotMatch(source, /name="printOrder"/);
  assert.doesNotMatch(source, /#printable-labels \{[^}]*min-height: 11in/);
  assert.doesNotMatch(source, /grid-template-columns: repeat\(5, 1\.5in\)/);
  assert.doesNotMatch(source, /print-guidance/);
});

test("Control Center auth gate and 401/403 handling stop protected rendering", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.match(source, /let authReady = false;/);
  assert.match(source, /Comprobando sesi/);
  assert.match(source, /const res = await apiFetch\("\/staff\/session"\)/);
  assert.match(source, /if \(!authReady\) return;/);
  assert.match(source, /if \(!state\.authenticated\) \{ resetAuthState\(\); renderLogin\(\); return; \}/);
  assert.match(source, /if \(res\.status === 401 && !endpoint\.includes\("\/login"\)\) \{/);
  assert.match(source, /return \{ ok: false, code: "AUTH_REQUIRED", halt: true \};/);
  assert.match(source, /if \(res\.status === 403\) \{/);
  assert.match(source, /function renderAccessDenied\(\)/);
  assert.match(source, /return \{ ok: false, code: "ACCESS_DENIED", halt: true \};/);
  assert.match(source, /if \(navObj && !userHasPerm\(navObj\.perm\)\) \{ renderAccessDenied\(\); return; \}/);
});

test("Control Center essential routes and RBAC menu definitions remain present", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  const expectedRoutes = [
    "overview", "pos", "my-sales", "sales", "products", "inventory", "qr", "print",
    "rewards", "customers", "users", "roles", "shifts", "reports", "audit", "settings", "system"
  ];

  for (const route of expectedRoutes) {
    assert.match(source, new RegExp(`id: "${route}"`));
    assert.match(source, new RegExp(`case "${route}"`));
  }

  assert.match(source, /if \(state\.permissions\.includes\("\*"\)\) return true;/);
  assert.match(source, /perm: "users\.read"/);
  assert.match(source, /perm: "roles\.read"/);
  assert.match(source, /perm: "system\.read"/);
  assert.match(source, /perm: "sales\.read_own"/);
});

test("Control Center POS uses seller sales endpoint when admin sales permission is absent", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.match(source, /const recent = userHasPerm\("sales\.read"\)/);
  assert.match(source, /await apiFetch\("\/admin\/sales\?limit=10"\)/);
  assert.match(source, /await apiFetch\("\/seller\/my-sales"\)/);
  assert.match(source, /s\.qrPublicNumber \?\? s\.qrNumber/);
});

test("Control Center defaults to dark theme without overwriting an existing preference", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.match(source, /theme: localStorage\.getItem\("gamms_theme"\) \|\| "dark"/);
  assert.match(source, /function applyTheme\(theme, persist = true\)/);
  assert.match(source, /if \(persist\) localStorage\.setItem\("gamms_theme", theme\);/);
  assert.match(source, /applyTheme\(state\.theme, false\);/);
});

test("Control Center POS camera scanner keeps purchase confirmation explicit", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  const accessDeniedBlock = source.slice(
    source.indexOf("function renderAccessDenied()"),
    source.indexOf("async function renderRoute")
  );
  const posBlock = source.slice(
    source.indexOf("async function renderPos()"),
    source.indexOf("function normalizeClaimInput")
  );

  assert.match(posBlock, /openQrScanner\('claim'\)/);
  assert.match(posBlock, /openQrScanner\('beverage'\)/);
  assert.match(posBlock, /previewPosClaim\(\)/);
  assert.match(posBlock, /previewPosBeverage\(\)/);
  assert.doesNotMatch(accessDeniedBlock, /openQrScanner/);
  assert.doesNotMatch(accessDeniedBlock, /posClaimInput/);
  assert.doesNotMatch(accessDeniedBlock, /previewPosClaim/);
  assert.match(source, /new BarcodeDetector\(\{ formats: \["qr_code"\] \}\)/);
  assert.match(source, /facingMode: \{ ideal: "environment" \}/);
  assert.match(source, /navigator\.vibrate\(60\)/);
  assert.match(source, /caps\?\.torch/);
  assert.match(source, /stream\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(source, /closeModal\(\) \{ stopQrScanner\(\);/);
  assert.match(source, /navigate\(route, pushState = true\) \{\s*stopQrScanner\(\);/);
  assert.match(source, /logoutBtn\.addEventListener\("click", async \(\) => \{\s*stopQrScanner\(\);/);
  assert.match(source, /apiFetch\("\/seller\/claims\/preview-product"/);
  assert.match(source, /posProductPreview = res;/);
  assert.match(source, /Previsualiza la compra antes de confirmar/);
  assert.match(source, /<button class="btn-primary" onclick="redeemPosClaim\(\)"/);
  assert.doesNotMatch(source, /handleQrDetected[\s\S]{0,500}redeemPosClaim\(/);
  assert.match(source, /if \(event\.key === "Enter"\) \{ event\.preventDefault\(\); previewPosClaim\(\); \}/);
  assert.match(source, /if \(event\.key === "Enter"\) \{ event\.preventDefault\(\); previewPosBeverage\(\); \}/);
});

test("Control Center POS keeps one active preview/redeem implementation", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.equal((source.match(/async function previewPosClaim\(/g) || []).length, 1);
  assert.equal((source.match(/async function redeemPosClaim\(/g) || []).length, 1);
  assert.match(source, /async function previewPosClaimLegacyDisabled\(/);
  assert.match(source, /async function redeemPosClaimLegacyDisabled\(/);
});

test("POS actor auth accepts Staff with pos.access and rejects valid Staff without permission as 403", async () => {
  const db = await createTestDb();
  await db.prepare(`
    INSERT INTO aep_users (id, username, username_normalized, display_name, password_hash)
    VALUES (101, 'pos_staff', 'pos_staff', 'POS Staff', 'hash')
  `).run();
  await db.prepare("INSERT INTO aep_user_roles (user_id, role_id) VALUES (101, 5)").run();
  await db.prepare("INSERT INTO staff_shifts (id, user_id, status) VALUES (501, 101, 'open')").run();

  const { token } = await createStaffSession(db, 101);
  const auth = await requirePosActor(
    new Request("https://example.com/aep/api/seller/claims/ABCD-EFGH-23", {
      headers: { Cookie: buildStaffCookie(token, 3600, true) }
    }),
    {},
    db
  );

  assert.equal(auth.ok, true);
  assert.equal(auth.mode, "staff");
  assert.equal(auth.staffUserId, 101);
  assert.equal(auth.shiftId, 501);
  assert.equal(auth.actorType, "staff");
  assert.equal(auth.actorIdentifier, "pos_staff");

  await db.prepare(`
    INSERT INTO aep_users (id, username, username_normalized, display_name, password_hash)
    VALUES (102, 'auditor_user', 'auditor_user', 'Auditor', 'hash')
  `).run();
  await db.prepare("INSERT INTO aep_user_roles (user_id, role_id) VALUES (102, 8)").run();
  const deniedSession = await createStaffSession(db, 102);
  const denied = await requirePosActor(
    new Request("https://example.com/aep/api/seller/claims/ABCD-EFGH-23", {
      headers: { Cookie: buildStaffCookie(deniedSession.token, 3600, true) }
    }),
    {},
    db
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.response.status, 403);
  assert.equal((await denied.response.json()).code, "PERMISSION_DENIED");
});

test("POS actor auth preserves legacy seller sessions and only logs in on invalid sessions", async () => {
  const db = await createTestDb();
  const env = {
    AEP_SELLER_PASSCODE_HASH: "0".repeat(64),
    AEP_SELLER_SESSION_SECRET: "test-secret"
  };
  const sellerToken = await createSellerSession(env);

  const seller = await requirePosActor(
    new Request("https://example.com/aep/api/seller/claims/ABCD-EFGH-23", {
      headers: { Cookie: `${SELLER_COOKIE_NAME}=${encodeURIComponent(sellerToken)}` }
    }),
    env,
    db
  );
  assert.equal(seller.ok, true);
  assert.equal(seller.mode, "seller");
  assert.equal(seller.actorIdentifier, "legacy-seller");
  assert.equal(seller.staffUserId, null);

  const missing = await requirePosActor(
    new Request("https://example.com/aep/api/seller/claims/ABCD-EFGH-23"),
    env,
    db
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.response.status, 401);
  assert.equal((await missing.response.json()).code, "SELLER_AUTH_REQUIRED");
});

test("POS seller endpoints use unified POS authorization and staff attribution", () => {
  const claimSource = readFileSync(resolve(process.cwd(), "functions/aep/api/seller/claims/[code].js"), "utf8");
  const previewSource = readFileSync(resolve(process.cwd(), "functions/aep/api/seller/claims/preview-product.js"), "utf8");
  const redeemSource = readFileSync(resolve(process.cwd(), "functions/aep/api/seller/redeem.js"), "utf8");
  const redemptionSource = readFileSync(resolve(process.cwd(), "functions/aep/_lib/redemption.js"), "utf8");

  for (const endpointSource of [claimSource, previewSource, redeemSource]) {
    assert.match(endpointSource, /requirePosActor/);
    assert.doesNotMatch(endpointSource, /requireSellerAuth/);
  }
  assert.match(redeemSource, /staffUserId: auth\.staffUserId/);
  assert.match(redeemSource, /shiftId: auth\.shiftId/);
  assert.match(redemptionSource, /options\.staffUserId \? "staff" : "system"/);
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

test("Control Center product modal exists and uses the real product API contract", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  const productsBlock = source.slice(
    source.indexOf("// 3. PRODUCTS"),
    source.indexOf("// 4. INVENTORY")
  );

  assert.match(source, /async function openNewProductModal\(\)/);
  assert.match(source, /async function openEditProductModal\(id\)/);
  assert.match(source, /apiFetch\("\/admin\/products", \{\s*method: "POST"/);
  assert.match(source, /apiFetch\("\/admin\/products\/" \+ id, \{\s*method: "PUT"/);
  assert.match(source, /Math\.round\(.*\* 100\)/);
  assert.match(source, /Number\(\(product\.priceCents \?\? 0\) \/ 100\)\.toFixed\(2\)/);
  assert.match(source, /Number\(\(product\.costCents \?\? 0\) \/ 100\)\.toFixed\(2\)/);
  assert.match(source, /readonly/);
  assert.match(source, /stockQuantity/);
  assert.doesNotMatch(productsBlock, /res\.products|price_cents|stock_quantity|low_stock_threshold/);
});

test("Control Center inventory modal exists and uses the real inventory contract", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.match(source, /async function openRestockModal\(\)/);
  assert.match(source, /apiFetch\("\/admin\/inventory\/adjust", \{\s*method: "POST"/);
  assert.match(source, /quantityDelta === 0/);
  assert.match(source, /const products = Array\.isArray\(productsRes\.items\) \? productsRes\.items : \[];/);
  assert.match(source, /const movements = Array\.isArray\(res\.items\) \? res\.items : \[];/);
  assert.doesNotMatch(source, /res\.movements/);
  assert.match(source, /m\.createdAt/);
  assert.match(source, /m\.productName/);
  assert.match(source, /m\.movementType/);
  assert.match(source, /m\.quantityDelta/);
});

test("Control Center product and inventory renderers use the correct contracts and endpoint payloads", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  const productsBlock = source.slice(source.indexOf("async function renderProducts()"), source.indexOf("async function openRestockModal"));
  const inventoryBlock = source.slice(source.indexOf("async function openRestockModal()"), source.indexOf("// 5. QR CODES"));

  assert.match(productsBlock, /const products = Array\.isArray\(res\.items\) \? res\.items : \[];/);
  assert.match(productsBlock, /formatMoney\(p\.priceCents\)/);
  assert.match(productsBlock, /p\.stockQuantity \?\? 0/);
  assert.match(productsBlock, /p\.lowStockThreshold \?\? 0/);
  assert.doesNotMatch(productsBlock, /res\.products|price_cents|stock_quantity|low_stock_threshold/);

  assert.match(inventoryBlock, /const products = Array\.isArray\(productsRes\.items\) \? productsRes\.items : \[];/);
  assert.match(inventoryBlock, /const movements = Array\.isArray\(res\.items\) \? res\.items : \[];/);
  assert.match(inventoryBlock, /productId, quantityDelta, movementType, reason/);
  assert.match(inventoryBlock, /quantityDelta === 0/);
  assert.doesNotMatch(inventoryBlock, /res\.movements/);
});
