import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

import { createProduct } from "./products.js";
import { hashQrToken } from "./crypto.js";
import { registerPurchase } from "./purchases.js";
import { upsertProductPromotionRule } from "./promotions.js";
import { createStaffSession, buildStaffCookie } from "./staffSessions.js";
import { onRequestPost as assistedSalePost } from "../api/admin/assisted/sale.js";
import { onRequestGet as assistedCustomersGet } from "../api/admin/assisted/customers.js";
import { onRequestGet as assistedQrGet } from "../api/admin/assisted/qr.js";

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
      for (const statement of statements) results.push(await statement.executeBatch());
      this.sqlite.exec("COMMIT;");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
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
    this.params = params.map((value) => value === undefined ? null : value);
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
    const statement = this.sqlite.prepare(this.sql);
    if (this.sql.toUpperCase().includes("RETURNING")) {
      const results = statement.all(...this.params);
      return { meta: { changes: results.length }, results };
    }
    const info = statement.run(...this.params);
    return { meta: { changes: info.changes }, results: [] };
  }
}

async function createTestDb() {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDir = resolve(process.cwd(), "database/migrations");
  for (const file of readdirSync(migrationsDir).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    if (sql.trim()) sqlite.exec(sql);
  }
  return new TestD1(sqlite);
}

async function insertAvailableQr(db, token, publicNumber, productId) {
  await db.prepare(
    "INSERT INTO qr_codes (public_number, token_hash, product_id, status) VALUES (?, ?, ?, 'available')"
  ).bind(publicNumber, await hashQrToken(token), productId).run();
}

async function createSellerCookie(db, userId = 981) {
  await db.prepare(`
    INSERT INTO aep_users (id, username, username_normalized, display_name, password_hash)
    VALUES (?, ?, ?, ?, 'hash')
  `).bind(userId, `assisted_${userId}`, `assisted_${userId}`, "Vendedor Prueba").run();
  await db.prepare("INSERT INTO aep_user_roles (user_id, role_id) VALUES (?, 5)").bind(userId).run();
  await db.prepare("INSERT INTO staff_shifts (id, user_id, status) VALUES (?, ?, 'open')")
    .bind(9000 + userId, userId).run();
  const { token } = await createStaffSession(db, userId);
  return buildStaffCookie(token, 3600, true);
}

function jsonRequest(url, cookie, body) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      host: "example.com",
      origin: "https://example.com",
      cookie
    },
    body: JSON.stringify(body)
  });
}

function getRequest(url, cookie) {
  return new Request(url, {
    headers: {
      accept: "application/json",
      host: "example.com",
      cookie
    }
  });
}

test("Venta Asistida redeems the current product reward percentage using a manual beverage code", async () => {
  const db = await createTestDb();
  const customerId = "cust_assisted_discount";
  await db.prepare("INSERT INTO customers (id, display_name) VALUES (?, 'Cliente Promo')").bind(customerId).run();

  const product = await createProduct(db, {
    name: "Batido Promo",
    priceCents: 4000,
    stockQuantity: 4
  });

  await upsertProductPromotionRule(db, {
    productId: product.product.id,
    enabled: true,
    everyN: 2,
    discountPercent: 50,
    repeatCycle: true
  });

  await insertAvailableQr(db, "PROMOINT0001", 9201, product.product.id);
  const first = await registerPurchase(
    db,
    new Request("https://example.com/aep/promo/r/PROMOINT0001"),
    "PROMOINT0001",
    { customerId }
  );
  assert.equal(first.ok, true);
  assert.equal(first.purchase.discountPercent, 0);
  assert.equal(first.progress.reward.available, true);
  assert.equal(first.progress.reward.discountPercent, 50);

  const rewardBefore = await db.prepare(
    "SELECT id, discount_percent, status FROM rewards WHERE customer_id = ? AND product_id = ? AND status = 'available'"
  ).bind(customerId, product.product.id).first();
  assert.ok(rewardBefore?.id);
  assert.equal(rewardBefore.discount_percent, 50);

  await upsertProductPromotionRule(db, {
    productId: product.product.id,
    enabled: true,
    everyN: 2,
    discountPercent: 25,
    repeatCycle: true
  });

  const rewardUpdated = await db.prepare("SELECT discount_percent FROM rewards WHERE id = ?").bind(rewardBefore.id).first();
  assert.equal(rewardUpdated.discount_percent, 25);

  await insertAvailableQr(db, "PROMOINT0002", 9202, product.product.id);
  const cookie = await createSellerCookie(db);
  const response = await assistedSalePost({
    request: jsonRequest(
      "https://example.com/aep/api/admin/assisted/sale",
      cookie,
      { customerId, token: "#9202", rewardId: rewardBefore.id }
    ),
    env: { DB: db }
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.promotionApplied, true);
  assert.equal(body.purchase.qrNumber, 9202);
  assert.equal(body.purchase.regularPriceCents, 4000);
  assert.equal(body.purchase.discountPercent, 25);
  assert.equal(body.purchase.finalPriceCents, 3000);

  const rewardAfter = await db.prepare("SELECT status, redeemed_purchase_id FROM rewards WHERE id = ?").bind(rewardBefore.id).first();
  assert.equal(rewardAfter.status, "redeemed");
  assert.ok(rewardAfter.redeemed_purchase_id);

  const qrAfter = await db.prepare("SELECT status FROM qr_codes WHERE public_number = 9202").first();
  assert.equal(qrAfter.status, "used");

  const attribution = await db.prepare(`
    SELECT staff_user_id, shift_id, actor_type
    FROM purchase_attribution
    WHERE purchase_id = ?
  `).bind(rewardAfter.redeemed_purchase_id).first();
  assert.equal(attribution.staff_user_id, 981);
  assert.equal(attribution.shift_id, 9981);
  assert.equal(attribution.actor_type, "staff");

  const saleMovement = await db.prepare(
    "SELECT COUNT(*) AS count FROM inventory_movements WHERE purchase_id = ? AND movement_type = 'sale'"
  ).bind(rewardAfter.redeemed_purchase_id).first();
  assert.equal(saleMovement.count, 1);
});

test("Venta Asistida customer search returns available coupon wallet counts and details", async () => {
  const db = await createTestDb();
  const cookie = await createSellerCookie(db, 982);
  const productA = await createProduct(db, { name: "Cacao", priceCents: 3000, stockQuantity: 10 });
  const productB = await createProduct(db, { name: "Cafe", priceCents: 5000, stockQuantity: 10 });

  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_wallet_0', 'Cero')").run();
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_wallet_1', 'Uno')").run();
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_wallet_2same', 'Dos Mismo')").run();
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_wallet_2diff', 'Dos Diferente')").run();

  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES ('cust_wallet_1', 'product_test', 25, 'available', 1, ?)").bind(productA.product.id).run();
  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES ('cust_wallet_2same', 'product_test', 25, 'available', 1, ?)").bind(productA.product.id).run();
  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES ('cust_wallet_2same', 'product_test', 50, 'available', 2, ?)").bind(productA.product.id).run();
  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES ('cust_wallet_2diff', 'product_test', 25, 'available', 1, ?)").bind(productA.product.id).run();
  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES ('cust_wallet_2diff', 'product_test', 100, 'available', 2, ?)").bind(productB.product.id).run();
  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES ('cust_wallet_2diff', 'product_test', 10, 'redeemed', 9, ?)").bind(productB.product.id).run();

  const response = await assistedCustomersGet({
    request: getRequest("https://example.com/aep/api/admin/assisted/customers?q=wallet", cookie),
    env: { DB: db }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const byId = Object.fromEntries(body.items.map((item) => [item.id, item]));

  assert.equal(byId.cust_wallet_0.availableRewardsCount, 0);
  assert.equal(byId.cust_wallet_1.availableRewardsCount, 1);
  assert.equal(byId.cust_wallet_2same.availableRewardsCount, 2);
  assert.equal(byId.cust_wallet_2same.availableRewards.filter((reward) => reward.productId === productA.product.id).length, 2);
  assert.equal(byId.cust_wallet_2diff.availableRewardsCount, 2);
  assert.ok(byId.cust_wallet_2diff.availableRewards.some((reward) => reward.productName === "Cacao" && reward.discountPercent === 25));
  assert.ok(byId.cust_wallet_2diff.availableRewards.some((reward) => reward.productName === "Cafe" && reward.discountPercent === 100));
  assert.ok(byId.cust_wallet_2diff.availableRewards.every((reward) => !("token" in reward) && !("tokenHash" in reward)));
});

test("Venta Asistida selected coupon is prepared only and redeemed only on confirmed matching sale", async () => {
  const db = await createTestDb();
  const cookie = await createSellerCookie(db, 983);
  const customerId = "cust_assisted_wallet";
  await db.prepare("INSERT INTO customers (id, display_name) VALUES (?, 'Wallet Cliente')").bind(customerId).run();
  const product = await createProduct(db, { name: "Gratis", priceCents: 4200, stockQuantity: 5 });
  await insertAvailableQr(db, "WALLETQR000001", 9301, product.product.id);
  await insertAvailableQr(db, "WALLETQR000002", 9302, product.product.id);
  await insertAvailableQr(db, "WALLETQR000003", 9303, product.product.id);

  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES (?, 'product_test', 100, 'available', 1, ?)").bind(customerId, product.product.id).run();
  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES (?, 'product_test', 50, 'available', 2, ?)").bind(customerId, product.product.id).run();
  const rewardsBefore = await db.prepare("SELECT id FROM rewards WHERE customer_id = ? ORDER BY id ASC").bind(customerId).all();
  const firstRewardId = rewardsBefore.results[0].id;
  const secondRewardId = rewardsBefore.results[1].id;

  const preview = await assistedQrGet({
    request: getRequest(`https://example.com/aep/api/admin/assisted/qr?input=%239301&customerId=${customerId}&rewardId=${firstRewardId}`, cookie),
    env: { DB: db }
  });
  assert.equal(preview.status, 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.pricing.discountPercent, 100);
  assert.equal(previewBody.pricing.finalPriceCents, 0);

  const stillAvailable = await db.prepare("SELECT status FROM rewards WHERE id = ?").bind(firstRewardId).first();
  assert.equal(stillAvailable.status, "available");

  const normalSale = await assistedSalePost({
    request: jsonRequest("https://example.com/aep/api/admin/assisted/sale", cookie, { customerId, token: "#9301" }),
    env: { DB: db }
  });
  assert.equal(normalSale.status, 200);
  const normalBody = await normalSale.json();
  assert.equal(normalBody.promotionApplied, false);
  assert.equal(normalBody.purchase.discountPercent, 0);
  assert.equal((await db.prepare("SELECT status FROM rewards WHERE id = ?").bind(firstRewardId).first()).status, "available");

  const couponSale = await assistedSalePost({
    request: jsonRequest("https://example.com/aep/api/admin/assisted/sale", cookie, { customerId, token: "#9302", rewardId: firstRewardId }),
    env: { DB: db }
  });
  assert.equal(couponSale.status, 200);
  const couponBody = await couponSale.json();
  assert.equal(couponBody.promotionApplied, true);
  assert.equal(couponBody.purchase.discountPercent, 100);
  assert.equal(couponBody.purchase.finalPriceCents, 0);
  assert.equal((await db.prepare("SELECT status FROM rewards WHERE id = ?").bind(firstRewardId).first()).status, "redeemed");
  assert.equal((await db.prepare("SELECT status FROM rewards WHERE id = ?").bind(secondRewardId).first()).status, "available");
});

test("Venta Asistida rejects coupon from another customer or wrong product", async () => {
  const db = await createTestDb();
  const cookie = await createSellerCookie(db, 984);
  const productA = await createProduct(db, { name: "Producto A", priceCents: 3000, stockQuantity: 5 });
  const productB = await createProduct(db, { name: "Producto B", priceCents: 3000, stockQuantity: 5 });
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_owner', 'Owner')").run();
  await db.prepare("INSERT INTO customers (id, display_name) VALUES ('cust_other', 'Other')").run();
  await insertAvailableQr(db, "REJECTQR000001", 9401, productA.product.id);
  await insertAvailableQr(db, "REJECTQR000002", 9402, productB.product.id);
  await db.prepare("INSERT INTO rewards (customer_id, reward_type, discount_percent, status, cycle_number, product_id) VALUES ('cust_owner', 'product_test', 25, 'available', 1, ?)").bind(productA.product.id).run();
  const reward = await db.prepare("SELECT id FROM rewards WHERE customer_id = 'cust_owner'").first();

  const otherCustomer = await assistedSalePost({
    request: jsonRequest("https://example.com/aep/api/admin/assisted/sale", cookie, { customerId: "cust_other", token: "#9401", rewardId: reward.id }),
    env: { DB: db }
  });
  assert.equal(otherCustomer.status, 409);

  const wrongProduct = await assistedSalePost({
    request: jsonRequest("https://example.com/aep/api/admin/assisted/sale", cookie, { customerId: "cust_owner", token: "#9402", rewardId: reward.id }),
    env: { DB: db }
  });
  assert.equal(wrongProduct.status, 409);

  const rewardAfter = await db.prepare("SELECT status FROM rewards WHERE id = ?").bind(reward.id).first();
  assert.equal(rewardAfter.status, "available");
});
