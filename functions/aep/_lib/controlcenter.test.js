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
import { formatFriendlyCustomerId as formatCustomerLabel } from "./customerProfile.js";
import { getDashboardStats } from "./dashboard.js";
import { cancelReward, listRewards } from "./rewardsAdmin.js";
import { listCustomers } from "./customersAdmin.js";
import { createSellerAccount, listSellers, resetSellerPasscode, updateSellerAccount } from "./sellers.js";
import { hashQrToken, sha256Hex } from "./crypto.js";
import { requirePosActor } from "./posAuth.js";
import { createSellerSession, SELLER_COOKIE_NAME } from "./sellerAuth.js";
import { buildStaffCookie, createStaffSession } from "./staffSessions.js";
import {
  ensureCustomerIdentityToken,
  resolveCustomerIdentityToken,
  revokeCustomerIdentityToken,
  CUSTOMER_IDENTITY_PREFIX
} from "./customerIdentity.js";
import { listProductPromotionRules, upsertProductPromotionRule } from "./promotions.js";
import { registerPurchase } from "./purchases.js";
import { getPurchaseAttribution } from "./purchaseAttribution.js";
import { onRequestGet as eventGet, onRequestPut as eventPut } from "../api/admin/event.js";
import { onRequestGet as controlCenterGet } from "../controlcenter/[[path]].js";
import { onRequestGet as promotionsGet, onRequestPut as promotionsPut } from "../api/admin/promotions.js";
import { onRequestPost as identityPost } from "../api/customer/identity.js";
import { onRequestPost as assistedSalePost } from "../api/admin/assisted/sale.js";
import { onRequestGet as assistedCustomersGet, onRequestPost as assistedCustomersPost } from "../api/admin/assisted/customers.js";
import { onRequestGet as assistedQrGet } from "../api/admin/assisted/qr.js";
import { onRequestPost as adminCustomerIdentityPost } from "../api/admin/customers/[id]/identity.js";
import { createRewardClaim } from "./claims.js";
import { previewClaimProduct, redeemClaim } from "./redemption.js";
import { resolvePhysicalQrInput } from "./physicalQr.js";

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

test("Control Center generated browser script remains syntactically valid", async () => {
  const response = controlCenterGet();
  const html = await response.text();
  const match = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);

  assert.ok(match, "main script tag should be present");
  assert.doesNotThrow(() => new Function(match[1]));
});

test("Control Center essential routes and RBAC menu definitions remain present", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  const expectedRoutes = [
    "overview", "pos", "venta-asistida", "my-sales", "sales", "products", "inventory", "qr", "print",
    "rewards", "customers", "users", "roles", "shifts", "reports", "audit", "configuracion-evento", "settings", "system"
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
  assert.match(source, /perm: "pos\.access"/);
  assert.match(source, /perm: "settings\.read"/);
});

test("Control Center exposes assisted sale and event configuration workflows", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.match(source, /id: "venta-asistida", label: "Venta Asistida", perm: "pos\.access"/);
  assert.match(source, /case "venta-asistida": return renderAssistedSales\(\);/);
  assert.match(source, /async function renderAssistedSales\(\)/);
  assert.match(source, /async function confirmAssistedSale\(\)/);
  assert.match(source, /apiFetch\("\/admin\/assisted\/customers/);
  assert.match(source, /apiFetch\("\/admin\/assisted\/sale", \{\s*method: "POST"/);
  assert.match(source, /openQrScanner\('assisted'\)/);
  assert.match(source, /showCustomerIdentityQr/);
  assert.match(source, /printCustomerIdentityTicket/);
  assert.match(source, /async function renderEventConfig\(\)/);
  assert.match(source, /id: "configuracion-evento", label: "Configuración del Evento", perm: "settings\.read"/);
  assert.match(source, /case "configuracion-evento": return renderEventConfig\(\);/);
  assert.match(source, /apiFetch\("\/admin\/event"/);
  assert.match(source, /apiFetch\("\/admin\/promotions"/);
  assert.match(source, /selectPromotionProduct/);
  assert.doesNotMatch(source, /handleQrDetected[\s\S]{0,700}confirmAssistedSale\(/);
});

test("Venta Asistida is only a Control Center module route", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");

  assert.match(source, /function getRouteFromUrl\(\)/);
  assert.ok(source.includes('window.location.pathname.replace(/^\\\\/aep\\\\/controlcenter\\\\/?/, "")'));
  assert.match(source, /return path \|\| "overview";/);
  assert.match(source, /if \(!state\.authenticated\) \{ resetAuthState\(\); renderLogin\(\); return; \}/);
  assert.match(source, /if \(navObj && !userHasPerm\(navObj\.perm\)\) \{ renderAccessDenied\(\); return; \}/);
  assert.match(source, /NAV_ITEMS\.filter\(item => userHasPerm\(item\.perm\)\)/);
  assert.doesNotMatch(source, /\/aep\/venta-asistida/);
  assert.throws(() => readFileSync(resolve(process.cwd(), "functions/aep/venta-asistida.js"), "utf8"), /ENOENT/);
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
  assert.equal(salesList.items[0].customerLabel, "Cliente #TEST");
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
  assert.equal(custRes.items[0].idMasked, "Cliente #A7F2");
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

test("friendly customer IDs understand real cust_ identifiers", () => {
  assert.equal(formatCustomerLabel("cust_a7f2abcdef"), "Cliente #A7F2");
  assert.equal(formatFriendlyCustomerId("cust_a7f2abcdef"), "Cliente #A7F2");
  assert.equal(formatCustomerLabel("cust_b8c3abcdef"), "Cliente #B8C3");
  assert.notEqual(formatCustomerLabel("cust_a7f2abcdef"), formatCustomerLabel("cust_b8c3abcdef"));
  assert.equal(formatCustomerLabel(null), "Cliente #0000");
  assert.equal(formatCustomerLabel(""), "Cliente #0000");
});

test("customer identity token can be emitted, explicitly rotated, resolved to cookie, and revoked", async () => {
  const db = await createTestDb();
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_identity_1', 'Cliente Uno')").run();

  const first = await ensureCustomerIdentityToken(db, "cust_identity_1", {
    generateToken: () => "a".repeat(64)
  });
  assert.equal(first.ok, true);
  assert.equal(first.identity.token, `${CUSTOMER_IDENTITY_PREFIX}${"a".repeat(64)}`);
  assert.match(first.identity.qrSvg, /<svg/);

  const second = await ensureCustomerIdentityToken(db, "cust_identity_1", {
    generateToken: () => "b".repeat(64)
  });
  assert.equal(second.ok, true);
  assert.equal(second.alreadyIssued, true);
  assert.equal(second.identity.token, undefined);

  const stillResolved = await resolveCustomerIdentityToken(
    db,
    `${CUSTOMER_IDENTITY_PREFIX}${"a".repeat(64)}`,
    new Request("https://example.com/aep/promo")
  );
  assert.equal(stillResolved.ok, true);

  const rotated = await ensureCustomerIdentityToken(db, "cust_identity_1", {
    rotate: true,
    generateToken: () => "b".repeat(64)
  });
  assert.equal(rotated.ok, true);
  assert.equal(rotated.identity.token, `${CUSTOMER_IDENTITY_PREFIX}${"b".repeat(64)}`);

  const oldResolve = await resolveCustomerIdentityToken(
    db,
    `${CUSTOMER_IDENTITY_PREFIX}${"a".repeat(64)}`,
    new Request("https://example.com/aep/promo")
  );
  assert.equal(oldResolve.ok, false);

  const resolved = await resolveCustomerIdentityToken(
    db,
    rotated.identity.token,
    new Request("https://example.com/aep/promo")
  );
  assert.equal(resolved.ok, true);
  assert.equal(resolved.customer.id, "cust_identity_1");
  assert.match(resolved.cookie, /GAMMS-AEP-Customer=cust_identity_1/);

  await revokeCustomerIdentityToken(db, "cust_identity_1");
  const revoked = await resolveCustomerIdentityToken(
    db,
    rotated.identity.token,
    new Request("https://example.com/aep/promo")
  );
  assert.equal(revoked.ok, false);
});

test("product promotion rules are stored per product and listed for event configuration", async () => {
  const db = await createTestDb();
  const product = await createProduct(db, { name: "Agua", priceCents: 2500, stockQuantity: 20 });

  const saved = await upsertProductPromotionRule(db, {
    productId: product.product.id,
    enabled: true,
    everyN: 4,
    discountPercent: 25,
    repeatCycle: true
  });

  assert.equal(saved.ok, true);
  assert.equal(saved.rule.product_id, product.product.id);
  assert.equal(saved.rule.every_n_purchases, 4);
  assert.equal(saved.rule.discount_percent, 25);

  const list = await listProductPromotionRules(db);
  const row = list.find((item) => item.productId === product.product.id);
  assert.equal(row.enabled, true);
  assert.equal(row.everyN, 4);
  assert.equal(row.discountPercent, 25);
});

async function insertAvailableQr(db, token, publicNumber, productId) {
  await db.prepare(
    "INSERT INTO qr_codes (public_number, token_hash, product_id, status) VALUES (?, ?, ?, 'available')"
  ).bind(publicNumber, await hashQrToken(token), productId).run();
}

async function insertCompletedPurchase(db, { customerId, token, publicNumber, productId, priceCents = 5000 }) {
  await insertAvailableQr(db, token, publicNumber, productId);
  await db.prepare("UPDATE qr_codes SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE public_number = ?").bind(publicNumber).run();
  await db.prepare(`
    INSERT INTO purchases (
      customer_id,
      product_id,
      qr_code_id,
      regular_price_cents,
      discount_percent,
      final_price_cents
    )
    SELECT ?, ?, id, ?, 0, ?
    FROM qr_codes
    WHERE public_number = ?
  `).bind(customerId, productId, priceCents, priceCents, publicNumber).run();
}

async function createStaffCookieWithRole(db, { id, username, roleId, openShift = false }) {
  await db.prepare(`
    INSERT INTO aep_users (id, username, username_normalized, display_name, password_hash)
    VALUES (?, ?, ?, ?, 'hash')
  `).bind(id, username, username, username).run();
  if (roleId) {
    await db.prepare("INSERT INTO aep_user_roles (user_id, role_id) VALUES (?, ?)").bind(id, roleId).run();
  }
  if (openShift) {
    await db.prepare("INSERT INTO staff_shifts (id, user_id, status) VALUES (?, ?, 'open')").bind(9000 + id, id).run();
  }
  const { token } = await createStaffSession(db, id);
  return buildStaffCookie(token, 3600, true);
}

async function createOwnerEnvAndCookie() {
  const env = {
    AEP_ADMIN_SESSION_SECRET: "owner-secret-for-tests",
    AEP_ADMIN_PASSCODE_HASH: "0".repeat(64),
    AEP_ADMIN_USERNAME: "owner"
  };
  const token = await createAdminSession(env, "owner");
  return { env, cookie: buildAdminCookie(token, { url: "https://example.com" }) };
}

function jsonRequest(url, { method = "PUT", cookie = "", body = {}, origin = "https://example.com" } = {}) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    host: "example.com",
    origin
  };
  if (cookie) headers.cookie = cookie;
  return new Request(url, { method, headers, body: JSON.stringify(body) });
}

test("assisted customer creation persists display_name and UI contract refreshes the list", async () => {
  const db = await createTestDb();
  const staffCookie = await createStaffCookieWithRole(db, { id: 703, username: "assisted_creator", roleId: 5 });
  const env = { DB: db };

  const created = await assistedCustomersPost({
    request: jsonRequest("https://example.com/aep/api/admin/assisted/customers", {
      method: "POST",
      cookie: staffCookie,
      body: { displayName: "Edith Potoy" }
    }),
    env
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.customer.displayName, "Edith Potoy");
  assert.match(createdBody.customer.customerLabel, /^Cliente #[A-Z0-9]{4}$/);

  const saved = await db.prepare("SELECT display_name FROM customers WHERE id = ?").bind(createdBody.customer.id).first();
  assert.equal(saved.display_name, "Edith Potoy");

  const listed = await assistedCustomersGet({
    request: new Request("https://example.com/aep/api/admin/assisted/customers?q=Edith", {
      headers: { cookie: staffCookie }
    }),
    env
  });
  const listBody = await listed.json();
  assert.ok(listBody.items.some((item) => item.id === createdBody.customer.id && item.displayName === "Edith Potoy"));

  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  assert.match(source, /await searchAssistedCustomers\(\);/);
  assert.match(source, /Identidad e impresi.n/);
  assert.match(source, /Escanea el QR o escribe el c.digo #127/);
  assert.match(source, /Conectar impresora t.rmica/);
  assert.match(source, /Imprimir QR cliente/);
});

test("assisted customer identity printing uses 58mm ESC/POS and safe browser fallbacks", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  const printingBlock = source.slice(
    source.indexOf("function detectPrintCapabilities()"),
    source.indexOf("async function renderAssistedSales()")
  );
  const connectBlock = source.slice(
    source.indexOf("async function connectThermalPrinter()"),
    source.indexOf("async function reconnectThermalPrinterIfAllowed()")
  );
  const printDispatcher = source.slice(
    source.indexOf("async function printCustomerIdentity(customer"),
    source.indexOf("async function renderAssistedSales()")
  );

  assert.match(printingBlock, /@page\{size:58mm auto;margin:3mm\}/);
  assert.match(printingBlock, /\.qr\{width:42mm;height:42mm/);
  assert.match(printingBlock, /\.qr svg\{width:40mm!important;height:40mm!important/);
  assert.match(printingBlock, /function systemPrintHtml\(html\)/);
  assert.match(printingBlock, /document\.createElement\("iframe"\)/);
  assert.match(printingBlock, /iframe\.srcdoc = html/);
  assert.doesNotMatch(printingBlock, /window\.open\("", "_blank", "noopener"\)/);

  assert.match(printingBlock, /webSerial: Boolean\(navigator\.serial && window\.isSecureContext\)/);
  assert.match(printingBlock, /baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none"/);
  assert.match(connectBlock, /navigator\.serial\.requestPort\(\)/);
  assert.equal((source.match(/navigator\.serial\.requestPort\(\)/g) || []).length, 1);
  assert.match(printingBlock, /Web Serial no est/);

  assert.match(printingBlock, /function svgToEscPosRasterBytes/);
  assert.match(printingBlock, /targetPx = 384/);
  assert.match(printingBlock, /new Uint8Array\(\[0x1d, 0x76, 0x30/);
  assert.match(printingBlock, /function escPosQrTicket/);
  assert.match(printingBlock, /async function escPosRasterQrTicket/);

  assert.match(printDispatcher, /window\.GAMMSPrinter\.postMessage/);
  assert.match(printDispatcher, /return "android-bridge"/);
  assert.match(printDispatcher, /await printCustomerIdentityEscPos\(customer\)/);
  assert.match(printDispatcher, /return "web-serial"/);
  assert.match(printDispatcher, /systemPrintHtml\(buildCustomerIdentityTicketHtml\(customer\)\)/);
  assert.match(printDispatcher, /return "system-print"/);
  assert.match(printDispatcher, /showCustomerIdentityQr\(\)/);
  assert.match(printDispatcher, /return "show-qr"/);
  assert.doesNotMatch(printDispatcher, /apiFetch\("/);
  assert.doesNotMatch(printDispatcher, /\/admin\/assisted\/sale|\/admin\/promotions|\/seller\/claims/);
});

test("staff physical QR resolver accepts token URL and public_number inputs", async () => {
  const db = await createTestDb();
  const product = await createProduct(db, { name: "Manual", priceCents: 4100, stockQuantity: 5 });
  await insertAvailableQr(db, "MANUALQR0001", 127, product.product.id);

  for (const input of [
    "MANUALQR0001",
    "https://example.com/aep/promo/r/MANUALQR0001",
    "127",
    "#127"
  ]) {
    const resolved = await resolvePhysicalQrInput(db, input);
    assert.equal(resolved.ok, true, input);
    assert.equal(resolved.qr.publicNumber, 127);
    assert.equal(resolved.qr.product.name, "Manual");
  }

  assert.equal((await resolvePhysicalQrInput(db, "#99999")).code, "QR_INVALID");
  await db.prepare("UPDATE qr_codes SET status = 'used' WHERE public_number = 127").run();
  assert.equal((await resolvePhysicalQrInput(db, "#127")).code, "QR_ALREADY_USED");
  await insertAvailableQr(db, "DISABLEDMAN1", 128, product.product.id);
  await db.prepare("UPDATE qr_codes SET status = 'disabled' WHERE public_number = 128").run();
  assert.equal((await resolvePhysicalQrInput(db, "#128")).code, "QR_DISABLED");
});

test("assisted sale accepts public_number manually and remains one-use without rotating identity", async () => {
  const db = await createTestDb();
  const product = await createProduct(db, { name: "Manual Sale", priceCents: 4300, stockQuantity: 2 });
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_manual_sale', 'Manual User')").run();
  await insertAvailableQr(db, "PUBLICSALE01", 129, product.product.id);
  const identity = await ensureCustomerIdentityToken(db, "cust_manual_sale", {
    generateToken: () => "e".repeat(64)
  });
  const staffCookie = await createStaffCookieWithRole(db, { id: 704, username: "manual_staff", roleId: 5, openShift: true });
  const env = { DB: db };

  const preview = await assistedQrGet({
    request: new Request("https://example.com/aep/api/admin/assisted/qr?input=%23129", {
      headers: { cookie: staffCookie }
    }),
    env
  });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).qr.publicNumber, 129);

  const context = () => ({
    request: jsonRequest("https://example.com/aep/api/admin/assisted/sale", {
      method: "POST",
      cookie: staffCookie,
      body: { customerId: "cust_manual_sale", token: "#129" }
    }),
    env
  });

  const first = await assistedSalePost(context());
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.identity, undefined);
  const resolvedOld = await resolveCustomerIdentityToken(db, identity.identity.token, new Request("https://example.com/aep/promo"));
  assert.equal(resolvedOld.ok, true);

  const second = await assistedSalePost(context());
  assert.equal(second.status, 400);
  const secondBody = await second.json();
  assert.equal(secondBody.code, "QR_ALREADY_USED");
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM purchases WHERE qr_code_id = (SELECT id FROM qr_codes WHERE public_number = 129)").first()).count, 1);
});

test("customer identity emit is explicit and reissue rotates the previous QR", async () => {
  const db = await createTestDb();
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_emit', 'Emit User')").run();
  const staffCookie = await createStaffCookieWithRole(db, { id: 705, username: "identity_staff", roleId: 5 });
  const env = { DB: db };

  const initial = await adminCustomerIdentityPost({
    request: jsonRequest("https://example.com/aep/api/admin/customers/cust_emit/identity", {
      method: "POST",
      cookie: staffCookie,
      body: {}
    }),
    env,
    params: { id: "cust_emit" }
  });
  assert.equal(initial.status, 200);
  const initialBody = await initial.json();
  assert.ok(initialBody.identity.token);

  const repeated = await adminCustomerIdentityPost({
    request: jsonRequest("https://example.com/aep/api/admin/customers/cust_emit/identity", {
      method: "POST",
      cookie: staffCookie,
      body: {}
    }),
    env,
    params: { id: "cust_emit" }
  });
  const repeatedBody = await repeated.json();
  assert.equal(repeatedBody.alreadyIssued, true);
  assert.equal(repeatedBody.identity.token, undefined);

  const rotated = await adminCustomerIdentityPost({
    request: jsonRequest("https://example.com/aep/api/admin/customers/cust_emit/identity", {
      method: "POST",
      cookie: staffCookie,
      body: { rotate: true }
    }),
    env,
    params: { id: "cust_emit" }
  });
  const rotatedBody = await rotated.json();
  assert.ok(rotatedBody.identity.token);
  assert.notEqual(rotatedBody.identity.token, initialBody.identity.token);

  assert.equal((await resolveCustomerIdentityToken(db, initialBody.identity.token, new Request("https://example.com/aep/promo"))).ok, false);
  assert.equal((await resolveCustomerIdentityToken(db, rotatedBody.identity.token, new Request("https://example.com/aep/promo"))).ok, true);
});

test("event_active blocks purchases and reactivation allows them again", async () => {
  const db = await createTestDb();
  const product = await createProduct(db, { name: "Cafe", priceCents: 3000, stockQuantity: 5 });
  await insertAvailableQr(db, "EVENTCLOSED1", 7001, product.product.id);

  await updateSettings(db, { event_active: "false" });
  const closed = await registerPurchase(db, new Request("https://example.com/aep/api/purchases"), "EVENTCLOSED1", {
    generateCustomerId: () => "cust_event_gate"
  });
  assert.equal(closed.ok, false);
  assert.equal(closed.code, "EVENT_CLOSED");

  const settings = await getSettings(db);
  assert.equal(settings.event_active, "false");

  await updateSettings(db, { event_active: "true" });
  const opened = await registerPurchase(db, new Request("https://example.com/aep/api/purchases"), "EVENTCLOSED1", {
    generateCustomerId: () => "cust_event_gate"
  });
  assert.equal(opened.ok, true);
});

test("product promotion progress is independent and same-product reward blocks only that product", async () => {
  const db = await createTestDb();
  const productA = await createProduct(db, { name: "Oreo", priceCents: 6000, stockQuantity: 10 });
  const productB = await createProduct(db, { name: "Fresa", priceCents: 5500, stockQuantity: 10 });

  await upsertProductPromotionRule(db, {
    productId: productA.product.id,
    enabled: true,
    everyN: 3,
    discountPercent: 50,
    repeatCycle: true
  });
  await upsertProductPromotionRule(db, {
    productId: productB.product.id,
    enabled: true,
    everyN: 5,
    discountPercent: 30,
    repeatCycle: true
  });

  await insertAvailableQr(db, "PRODAAAAAA01", 7101, productA.product.id);
  await insertAvailableQr(db, "PRODBBBBBB01", 7201, productB.product.id);
  await insertAvailableQr(db, "PRODAAAAAA02", 7102, productA.product.id);
  await insertAvailableQr(db, "PRODBBBBBB02", 7202, productB.product.id);
  await insertAvailableQr(db, "PRODAAAAAA03", 7103, productA.product.id);

  const request = () => new Request("https://example.com/aep/api/purchases", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_product_progress" }
  });

  assert.equal((await registerPurchase(db, request(), "PRODAAAAAA01")).ok, true);
  assert.equal((await registerPurchase(db, request(), "PRODBBBBBB01")).ok, true);
  const secondA = await registerPurchase(db, request(), "PRODAAAAAA02");
  assert.equal(secondA.ok, true);
  assert.equal(secondA.progress.reward.available, true);
  assert.equal(secondA.progress.reward.discountPercent, 50);

  const blockedA = await registerPurchase(db, request(), "PRODAAAAAA03");
  assert.equal(blockedA.ok, false);
  assert.equal(blockedA.code, "REWARD_REQUIRES_SELLER");

  const secondB = await registerPurchase(db, request(), "PRODBBBBBB02");
  assert.equal(secondB.ok, true);
  assert.equal(secondB.progress.purchaseCount, 2);
  assert.equal(secondB.progress.reward.available, false);
});

test("product promotion cycles support N=2, N=3, N=5, repeat=false, disabled, and 100 percent", async () => {
  const db = await createTestDb();
  const p2 = await createProduct(db, { name: "N2", priceCents: 2000, stockQuantity: 20 });
  const p3 = await createProduct(db, { name: "N3", priceCents: 3000, stockQuantity: 20 });
  const p5 = await createProduct(db, { name: "N5", priceCents: 5000, stockQuantity: 20 });
  const pNoRepeat = await createProduct(db, { name: "NoRepeat", priceCents: 3500, stockQuantity: 20 });
  const pDisabled = await createProduct(db, { name: "Disabled", priceCents: 4500, stockQuantity: 20 });
  const pFree = await createProduct(db, { name: "Free", priceCents: 1000, stockQuantity: 20 });

  await upsertProductPromotionRule(db, { productId: p2.product.id, enabled: true, everyN: 2, discountPercent: 20, repeatCycle: true });
  await upsertProductPromotionRule(db, { productId: p3.product.id, enabled: true, everyN: 3, discountPercent: 30, repeatCycle: true });
  await upsertProductPromotionRule(db, { productId: p5.product.id, enabled: true, everyN: 5, discountPercent: 40, repeatCycle: true });
  await upsertProductPromotionRule(db, { productId: pNoRepeat.product.id, enabled: true, everyN: 3, discountPercent: 50, repeatCycle: false });
  await upsertProductPromotionRule(db, { productId: pDisabled.product.id, enabled: false, everyN: 3, discountPercent: 60, repeatCycle: true });
  await upsertProductPromotionRule(db, { productId: pFree.product.id, enabled: true, everyN: 2, discountPercent: 100, repeatCycle: true });

  async function buy(productId, token, publicNumber, customerId) {
    await insertAvailableQr(db, token, publicNumber, productId);
    return registerPurchase(db, new Request("https://example.com/aep/api/purchases", {
      headers: { cookie: `GAMMS-AEP-Customer=${customerId}` }
    }), token);
  }

  assert.equal((await buy(p2.product.id, "N2PROMO00001", 8101, "cust_n2")).progress.reward.available, true);

  assert.equal((await buy(p3.product.id, "N3PROMO00001", 8201, "cust_n3")).progress.reward.available, false);
  assert.equal((await buy(p3.product.id, "N3PROMO00002", 8202, "cust_n3")).progress.reward.available, true);

  for (let i = 1; i <= 3; i += 1) {
    assert.equal((await buy(p5.product.id, `N5PROMO0000${i}`, 8300 + i, "cust_n5")).progress.reward.available, false);
  }
  assert.equal((await buy(p5.product.id, "N5PROMO00004", 8304, "cust_n5")).progress.reward.available, true);

  assert.equal((await buy(pNoRepeat.product.id, "NOREPEAT0001", 8401, "cust_no_repeat")).progress.reward.available, false);
  assert.equal((await buy(pNoRepeat.product.id, "NOREPEAT0002", 8402, "cust_no_repeat")).progress.reward.available, true);
  await db.prepare("UPDATE rewards SET status = 'redeemed' WHERE customer_id = 'cust_no_repeat'").run();
  assert.equal((await buy(pNoRepeat.product.id, "NOREPEAT0003", 8403, "cust_no_repeat")).ok, true);
  assert.equal((await buy(pNoRepeat.product.id, "NOREPEAT0004", 8404, "cust_no_repeat")).progress.reward.available, false);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM rewards WHERE customer_id = 'cust_no_repeat'").first()).count, 1);

  assert.equal((await buy(pDisabled.product.id, "DISABLED0001", 8501, "cust_disabled")).progress.reward.available, false);

  const free = await buy(pFree.product.id, "FREEPROMO001", 8601, "cust_free");
  assert.equal(free.progress.reward.available, true);
  assert.equal(free.progress.reward.discountPercent, 100);
});

test("available product reward follows updated rule discount without changing redeemed history", async () => {
  const db = await createTestDb();
  const product = await createProduct(db, { name: "Promo Variable", priceCents: 4000, stockQuantity: 5 });
  await upsertProductPromotionRule(db, {
    productId: product.product.id,
    enabled: true,
    everyN: 2,
    discountPercent: 50,
    repeatCycle: true
  });
  await insertAvailableQr(db, "VARPROMO0001", 8601, product.product.id);
  const first = await registerPurchase(db, new Request("https://example.com/aep/api/purchases", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_variable_discount" }
  }), "VARPROMO0001");
  assert.equal(first.ok, true);
  assert.equal(first.progress.reward.discountPercent, 50);

  const available = await db.prepare("SELECT id, promotion_rule_id, discount_percent FROM rewards WHERE customer_id = 'cust_variable_discount' AND status = 'available'").first();
  assert.equal(available.discount_percent, 50);

  await upsertProductPromotionRule(db, {
    productId: product.product.id,
    enabled: true,
    everyN: 2,
    discountPercent: 25,
    repeatCycle: true
  });
  const updated = await db.prepare("SELECT discount_percent FROM rewards WHERE id = ?").bind(available.id).first();
  assert.equal(updated.discount_percent, 25);

  const claim = await createRewardClaim(db, new Request("https://example.com/aep/api/rewards/claim", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_variable_discount" }
  }), null, {
    generateClaimCode: () => "ZXCVBNMKLH"
  });
  assert.equal(claim.ok, true);
  await insertAvailableQr(db, "VARPROMO0002", 8602, product.product.id);

  const preview = await previewClaimProduct(db, "ZXCVBNMKLH", "#8602");
  assert.equal(preview.ok, true);
  assert.equal(preview.pricing.discountPercent, 25);
  assert.equal(preview.pricing.finalPriceCents, 3000);

  const redeemed = await redeemClaim(db, "ZXCVBNMKLH", { physicalQrToken: "#8602" });
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.purchase.discountPercent, 25);
  assert.equal(redeemed.purchase.finalPriceCents, 3000);

  await upsertProductPromotionRule(db, {
    productId: product.product.id,
    enabled: true,
    everyN: 2,
    discountPercent: 75,
    repeatCycle: true
  });
  const redeemedReward = await db.prepare("SELECT discount_percent FROM rewards WHERE id = ?").bind(available.id).first();
  assert.equal(redeemedReward.discount_percent, 25);
});

test("customer identity switch requires explicit confirmation and plaintext token is not persisted", async () => {
  const db = await createTestDb();
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_a_identity', 'Matthew')").run();
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_b_identity', 'Carlos')").run();

  const generated = await ensureCustomerIdentityToken(db, "cust_b_identity", {
    generateToken: () => "c".repeat(64)
  });
  const plain = generated.identity.token;
  const row = await db.prepare("SELECT token_hash FROM customer_identity_tokens WHERE customer_id = 'cust_b_identity'").first();
  assert.ok(row.token_hash);
  const persisted = await db.prepare("SELECT * FROM customer_identity_tokens").all();
  assert.equal(JSON.stringify(persisted.results).includes(plain), false);
  assert.equal(JSON.stringify(persisted.results).includes("c".repeat(64)), false);

  const same = await resolveCustomerIdentityToken(db, plain, new Request("https://example.com/aep/promo", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_b_identity" }
  }));
  assert.equal(same.ok, true);

  const conflictResponse = await identityPost({
    request: jsonRequest("https://example.com/aep/api/customer/identity", {
      method: "POST",
      cookie: "GAMMS-AEP-Customer=cust_a_identity",
      body: { token: plain }
    }),
    env: { DB: db }
  });
  assert.equal(conflictResponse.status, 409);
  assert.equal(conflictResponse.headers.get("set-cookie"), null);
  const conflict = await conflictResponse.json();
  assert.equal(conflict.code, "IDENTITY_SWITCH_CONFIRMATION_REQUIRED");

  const confirmedResponse = await identityPost({
    request: jsonRequest("https://example.com/aep/api/customer/identity", {
      method: "POST",
      cookie: "GAMMS-AEP-Customer=cust_a_identity",
      body: { token: plain, confirmSwitch: true }
    }),
    env: { DB: db }
  });
  assert.equal(confirmedResponse.status, 200);
  assert.match(confirmedResponse.headers.get("set-cookie"), /GAMMS-AEP-Customer=cust_b_identity/);

  await revokeCustomerIdentityToken(db, "cust_b_identity");
  const revoked = await resolveCustomerIdentityToken(db, plain, new Request("https://example.com/aep/promo"));
  assert.equal(revoked.ok, false);
});

test("recovering customer identity preserves original beverage QR until purchase confirmation", async () => {
  const db = await createTestDb();
  const product = await createProduct(db, { name: "Bebida Recovery", priceCents: 3200, stockQuantity: 5 });
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_recovery', 'Recovery User')").run();
  const identity = await ensureCustomerIdentityToken(db, "cust_recovery", { generateToken: () => "d".repeat(64) });
  await insertAvailableQr(db, "RECOVERYQR01", 8701, product.product.id);

  const identityResponse = await identityPost({
    request: jsonRequest("https://example.com/aep/api/customer/identity", {
      method: "POST",
      body: { token: identity.identity.token }
    }),
    env: { DB: db }
  });
  assert.equal(identityResponse.status, 200);
  const setCookie = identityResponse.headers.get("set-cookie");
  assert.match(setCookie, /GAMMS-AEP-Customer=cust_recovery/);

  const qrBefore = await db.prepare("SELECT status FROM qr_codes WHERE public_number = 8701").first();
  assert.equal(qrBefore.status, "available");

  const purchase = await registerPurchase(db, new Request("https://example.com/aep/api/purchases", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_recovery" }
  }), "RECOVERYQR01");
  assert.equal(purchase.ok, true);
  const qrAfter = await db.prepare("SELECT status FROM qr_codes WHERE public_number = 8701").first();
  assert.equal(qrAfter.status, "used");
});

test("legacy pre-linked claims use product rules, isolate products, and still support global legacy rewards", async () => {
  const db = await createTestDb();
  const oreo = await createProduct(db, { name: "Oreo", priceCents: 5200, stockQuantity: 10 });
  const fresa = await createProduct(db, { name: "Fresa", priceCents: 5100, stockQuantity: 10 });
  const rule = await upsertProductPromotionRule(db, {
    productId: oreo.product.id,
    enabled: true,
    everyN: 5,
    discountPercent: 50,
    repeatCycle: true
  });

  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_claim_product', 'Producto')").run();
  for (let i = 0; i < 4; i += 1) {
    await insertCompletedPurchase(db, {
      customerId: "cust_claim_product",
      token: `OREOCLAIM00${i}`,
      publicNumber: 8900 + i,
      productId: oreo.product.id,
      priceCents: oreo.product.priceCents
    });
  }
  await db.prepare(`
    INSERT INTO rewards (
      customer_id,
      reward_type,
      discount_percent,
      status,
      cycle_number,
      product_id,
      promotion_rule_id
    )
    VALUES ('cust_claim_product', 'product_${oreo.product.id}_discount', 50, 'available', 1, ?, ?)
  `).bind(oreo.product.id, rule.rule.id).run();
  await insertAvailableQr(db, "FRESACLAIM01", 8910, fresa.product.id);
  await insertAvailableQr(db, "OREOREWARD01", 8911, oreo.product.id);

  const productRequest = new Request("https://example.com/aep/api/rewards/claim", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_claim_product" }
  });
  const wrongProduct = await createRewardClaim(db, productRequest, "FRESACLAIM01");
  assert.equal(wrongProduct.ok, false);
  assert.equal(wrongProduct.code, "REWARD_NOT_AVAILABLE");

  const productClaim = await createRewardClaim(db, productRequest, "OREOREWARD01", {
    generateClaimCode: () => "ABCDEFGHJK"
  });
  assert.equal(productClaim.ok, true);
  assert.equal(productClaim.claim.product.name, "Oreo");

  const wrongPreview = await previewClaimProduct(db, "ABCDEFGHJK", "FRESACLAIM01");
  assert.equal(wrongPreview.ok, false);
  assert.equal(wrongPreview.code, "REWARD_NOT_AVAILABLE");
  const rightPreview = await previewClaimProduct(db, "ABCDEFGHJK", "OREOREWARD01");
  assert.equal(rightPreview.ok, true);
  assert.equal(rightPreview.product.id, oreo.product.id);

  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_claim_legacy', 'Legacy')").run();
  await insertCompletedPurchase(db, {
    customerId: "cust_claim_legacy",
    token: "LEGACYDONE01",
    publicNumber: 8920,
    productId: oreo.product.id,
    priceCents: oreo.product.priceCents
  });
  await insertCompletedPurchase(db, {
    customerId: "cust_claim_legacy",
    token: "LEGACYDONE02",
    publicNumber: 8921,
    productId: fresa.product.id,
    priceCents: fresa.product.priceCents
  });
  await db.prepare(`
    INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number)
    VALUES ('cust_claim_legacy', 'third_drink_50', 50, 'available', 1)
  `).run();
  await insertAvailableQr(db, "LEGACYREWARD", 8922, fresa.product.id);

  const legacyClaim = await createRewardClaim(db, new Request("https://example.com/aep/api/rewards/claim", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_claim_legacy" }
  }), "LEGACYREWARD", {
    generateClaimCode: () => "KJHGFEDCBA"
  });
  assert.equal(legacyClaim.ok, true);
  assert.equal(legacyClaim.claim.product.name, "Fresa");
});

test("event and promotion APIs enforce RBAC, CSRF, validation, and persistence", async () => {
  const db = await createTestDb();
  const product = await createProduct(db, { name: "Configurable", priceCents: 4700, stockQuantity: 10 });
  const { env: ownerEnv, cookie: ownerCookie } = await createOwnerEnvAndCookie();
  ownerEnv.DB = db;
  const deniedCookie = await createStaffCookieWithRole(db, { id: 701, username: "audit_no_settings", roleId: null });

  const noSession = await eventGet({ request: new Request("https://example.com/aep/api/admin/event"), env: { DB: db } });
  assert.equal(noSession.status, 401);

  const denied = await eventGet({ request: new Request("https://example.com/aep/api/admin/event", {
    headers: { cookie: deniedCookie }
  }), env: { DB: db } });
  assert.equal(denied.status, 403);

  const eventRead = await eventGet({ request: new Request("https://example.com/aep/api/admin/event", {
    headers: { cookie: ownerCookie }
  }), env: ownerEnv });
  assert.equal(eventRead.status, 200);

  const badCsrf = await eventPut({
    request: new Request("https://example.com/aep/api/admin/event", {
      method: "PUT",
      headers: { cookie: ownerCookie, "content-type": "application/json", host: "example.com", origin: "https://evil.example" },
      body: JSON.stringify({ active: false })
    }),
    env: ownerEnv
  });
  assert.equal(badCsrf.status, 403);

  const eventWrite = await eventPut({
    request: jsonRequest("https://example.com/aep/api/admin/event", {
      cookie: ownerCookie,
      body: { active: false }
    }),
    env: ownerEnv
  });
  assert.equal(eventWrite.status, 200);
  assert.equal((await getSettings(db)).event_active, "false");

  for (const body of [
    {},
    { productId: product.product.id, everyN: 1, discountPercent: 50 },
    { productId: product.product.id, everyN: 3, discountPercent: 0 },
    { productId: product.product.id, everyN: 3, discountPercent: 101 }
  ]) {
    const response = await promotionsPut({
      request: jsonRequest("https://example.com/aep/api/admin/promotions", { cookie: ownerCookie, body }),
      env: ownerEnv
    });
    assert.equal(response.status, 400);
  }

  const valid = await promotionsPut({
    request: jsonRequest("https://example.com/aep/api/admin/promotions", {
      cookie: ownerCookie,
      body: { productId: product.product.id, enabled: true, everyN: 3, discountPercent: 100, repeatCycle: true }
    }),
    env: ownerEnv
  });
  assert.equal(valid.status, 200);

  const disabled = await promotionsPut({
    request: jsonRequest("https://example.com/aep/api/admin/promotions", {
      cookie: ownerCookie,
      body: { productId: product.product.id, enabled: false, everyN: 5, discountPercent: 25, repeatCycle: false }
    }),
    env: ownerEnv
  });
  assert.equal(disabled.status, 200);
  const listed = await promotionsGet({ request: new Request("https://example.com/aep/api/admin/promotions", {
    headers: { cookie: ownerCookie }
  }), env: ownerEnv });
  const payload = await listed.json();
  const rule = payload.items.find((item) => item.productId === product.product.id);
  assert.equal(rule.enabled, false);
  assert.equal(rule.everyN, 5);
  assert.equal(rule.discountPercent, 25);
});

test("assisted sale creates purchase, inventory movement, attribution, and remains one-use", async () => {
  const db = await createTestDb();
  const product = await createProduct(db, { name: "Asistida", priceCents: 3900, stockQuantity: 2 });
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_assisted', 'Asistido')").run();
  await insertAvailableQr(db, "ASSISTEDQR01", 8801, product.product.id);
  const staffCookie = await createStaffCookieWithRole(db, { id: 702, username: "assisted_staff", roleId: 5, openShift: true });

  const context = () => ({
    request: jsonRequest("https://example.com/aep/api/admin/assisted/sale", {
      method: "POST",
      cookie: staffCookie,
      body: { customerId: "cust_assisted", token: "ASSISTEDQR01" }
    }),
    env: { DB: db }
  });

  const first = await assistedSalePost(context());
  const firstBody = await first.json();
  assert.equal(first.status, 200, JSON.stringify(firstBody));
  assert.equal(firstBody.ok, true);

  const purchase = await db.prepare("SELECT * FROM purchases WHERE customer_id = 'cust_assisted'").first();
  assert.ok(purchase?.id);
  assert.equal((await db.prepare("SELECT stock_quantity FROM products WHERE id = ?").bind(product.product.id).first()).stock_quantity, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE purchase_id = ?").bind(purchase.id).first()).count, 1);

  const attribution = await getPurchaseAttribution(db, purchase.id);
  assert.equal(attribution.staff_user_id, 702);
  assert.equal(attribution.shift_id, 9702);
  assert.equal(attribution.actor_type, "staff");

  const second = await assistedSalePost(context());
  const secondBody = await second.json();
  assert.equal(secondBody.ok, false);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM purchases WHERE qr_code_id = ?").bind(purchase.qr_code_id).first()).count, 1);
});
