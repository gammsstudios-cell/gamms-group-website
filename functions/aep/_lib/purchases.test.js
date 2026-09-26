import assert from "node:assert/strict";
import test from "node:test";

import { hashQrToken } from "./crypto.js";
import { registerPurchase } from "./purchases.js";

class FakeD1 {
  constructor() {
    this.products = new Map([[1, { id: 1, name: "Bebida", price_cents: 4000, active: 1, stock_quantity: 50 }]]);
    this.customers = new Map();
    this.qrCodes = new Map();
    this.purchases = [];
    this.rewards = [];
    this.inventoryMovements = [];
    this.failNextPurchaseInsert = false;
    this.failNextRewardInsert = false;
    this.failNextStockUpdate = false;
    this.failNextInventoryInsert = false;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const snapshot = {
      qrCodes: new Map(Array.from(this.qrCodes, ([key, value]) => [key, { ...value }])),
      purchases: this.purchases.map((purchase) => ({ ...purchase })),
      rewards: this.rewards.map((reward) => ({ ...reward })),
      products: new Map(Array.from(this.products, ([key, value]) => [key, { ...value }])),
      inventoryMovements: [...this.inventoryMovements]
    };

    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.executeBatch());
      }
      return results;
    } catch (error) {
      this.qrCodes = snapshot.qrCodes;
      this.purchases = snapshot.purchases;
      this.rewards = snapshot.rewards;
      this.products = snapshot.products;
      this.inventoryMovements = snapshot.inventoryMovements;
      throw error;
    }
  }

  addQr({ id, publicNumber, tokenHash, productId = 1, status = "available" }) {
    this.qrCodes.set(tokenHash, {
      id,
      public_number: publicNumber,
      token_hash: tokenHash,
      product_id: productId,
      status
    });
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async run() {
    if (this.sql.includes("INSERT INTO customers")) {
      const [customerId] = this.params;
      const current = this.db.customers.get(customerId) ?? { id: customerId, created_at: "now" };
      this.db.customers.set(customerId, { ...current, last_seen_at: "now" });
      return { success: true };
    }

    throw new Error(`Unhandled run SQL: ${this.sql}`);
  }

  async first() {
    if (this.sql.includes("FROM rewards")) {
      const [customerId, rewardType] = this.params;
      return this.db.rewards
        .filter((reward) =>
          reward.customer_id === customerId &&
          reward.reward_type === rewardType &&
          reward.status === "available"
        )
        .sort((a, b) => a.cycle_number - b.cycle_number)[0] ?? null;
    }

    if (this.sql.includes("FROM qr_codes q")) {
      const [tokenHash] = this.params;
      const qr = this.db.qrCodes.get(tokenHash);
      if (!qr) return null;
      const product = this.db.products.get(qr.product_id);

      return {
        status: qr.status,
        product_id: qr.product_id,
        valid_product_id: product?.active === 1 ? product.id : null,
        stock_quantity: product ? (product.stock_quantity ?? 0) : 0,
        purchase_id: this.db.purchases.find((purchase) => purchase.qr_code_id === qr.id)?.id ?? null
      };
    }

    if (this.sql.includes("FROM products")) {
      const [productId] = this.params;
      const product = this.db.products.get(productId);
      return product?.active === 1 ? product : null;
    }

    if (this.sql.includes("COUNT(*) AS purchase_count")) {
      const [customerId] = this.params;
      return {
        purchase_count: this.db.purchases.filter((purchase) => purchase.customer_id === customerId).length
      };
    }

    throw new Error(`Unhandled first SQL: ${this.sql}`);
  }

  async executeBatch() {
    if (this.sql.includes("INSERT INTO purchases")) {
      if (this.db.failNextPurchaseInsert) {
        this.db.failNextPurchaseInsert = false;
        throw new Error("artificial purchase insert failure");
      }

      const [customerId, tokenHash, rewardCustomerId, rewardType] = this.params;
      const qr = this.db.qrCodes.get(tokenHash);
      const product = qr ? this.db.products.get(qr.product_id) : null;
      const hasAvailableReward = this.db.rewards.some((reward) =>
        reward.customer_id === rewardCustomerId &&
        reward.reward_type === rewardType &&
        reward.status === "available"
      );

      if (!qr || qr.status !== "available" || !product || product.active !== 1 || (product.stock_quantity ?? 0) <= 0 || hasAvailableReward) {
        return { meta: { changes: 0 }, results: [] };
      }

      if (this.db.purchases.some((purchase) => purchase.qr_code_id === qr.id)) {
        throw new Error("UNIQUE constraint failed: purchases.qr_code_id");
      }

      this.db.purchases.push({
        id: this.db.purchases.length + 1,
        customer_id: customerId,
        product_id: product.id,
        qr_code_id: qr.id,
        regular_price_cents: product.price_cents,
        discount_percent: 0,
        final_price_cents: product.price_cents
      });

      return { meta: { changes: 1 }, results: [] };
    }

    if (this.sql.includes("UPDATE qr_codes")) {
      const [tokenHash] = this.params;
      const qr = this.db.qrCodes.get(tokenHash);
      const hasPurchase = qr
        ? this.db.purchases.some((purchase) => purchase.qr_code_id === qr.id)
        : false;

      if (!qr || qr.status !== "available" || !hasPurchase) {
        return { meta: { changes: 0 }, results: [] };
      }

      qr.status = "used";
      qr.used_at = "now";

      return {
        meta: { changes: 1 },
        results: [{
          id: qr.id,
          product_id: qr.product_id,
          public_number: qr.public_number
        }]
      };
    }

    if (this.sql.includes("INSERT INTO rewards")) {
      if (this.db.failNextRewardInsert) {
        this.db.failNextRewardInsert = false;
        throw new Error("artificial reward insert failure");
      }

      const [
        customerId,
        rewardType,
        discountPercent,
        purchaseCustomerId,
        uniqueCustomerId,
        uniqueRewardType
      ] = this.params;
      assert.equal(customerId, purchaseCustomerId);
      assert.equal(customerId, uniqueCustomerId);
      assert.equal(rewardType, uniqueRewardType);

      const purchaseCount = this.db.purchases
        .filter((purchase) => purchase.customer_id === customerId).length;

      if (purchaseCount <= 0 || purchaseCount % 3 !== 2) {
        return { meta: { changes: 0 }, results: [] };
      }

      const cycleNumber = Math.floor((purchaseCount - 1) / 3) + 1;
      const duplicate = this.db.rewards.some((reward) =>
        reward.customer_id === customerId &&
        reward.reward_type === rewardType &&
        reward.cycle_number === cycleNumber
      );

      if (duplicate) {
        return { meta: { changes: 0 }, results: [] };
      }

      const reward = {
        id: this.db.rewards.length + 1,
        customer_id: customerId,
        reward_type: rewardType,
        discount_percent: discountPercent,
        status: "available",
        cycle_number: cycleNumber
      };
      this.db.rewards.push(reward);

      return {
        meta: { changes: 1 },
        results: [{
          reward_type: reward.reward_type,
          discount_percent: reward.discount_percent,
          cycle_number: reward.cycle_number
        }]
      };
    }

    if (this.sql.includes("UPDATE products")) {
      if (this.db.failNextStockUpdate) {
        this.db.failNextStockUpdate = false;
        throw new Error("artificial stock update failure");
      }
      const [tokenHash] = this.params;
      const qr = this.db.qrCodes.get(tokenHash);
      if (qr) {
        const product = this.db.products.get(qr.product_id);
        if (product && product.stock_quantity > 0) {
          product.stock_quantity -= 1;
          return { meta: { changes: 1 }, results: [] };
        }
      }
      return { meta: { changes: 0 }, results: [] };
    }

    if (this.sql.includes("INSERT INTO inventory_movements")) {
      if (this.db.failNextInventoryInsert) {
        this.db.failNextInventoryInsert = false;
        throw new Error("artificial inventory insert failure");
      }
      const [actorIdentifier, tokenHash] = this.params;
      const qr = this.db.qrCodes.get(tokenHash);
      const purchase = qr ? this.db.purchases.find((p) => p.qr_code_id === qr.id) : null;
      if (qr && purchase) {
        this.db.inventoryMovements.push({
          id: this.db.inventoryMovements.length + 1,
          product_id: qr.product_id,
          movement_type: "sale",
          quantity_delta: -1,
          purchase_id: purchase.id
        });
        return { meta: { changes: 1 }, results: [] };
      }
      return { meta: { changes: 0 }, results: [] };
    }

    throw new Error(`Unhandled batch SQL: ${this.sql}`);
  }
}

function purchaseRequest(cookie) {
  return new Request("https://example.com/aep/api/purchases", {
    method: "POST",
    headers: cookie ? { cookie } : undefined
  });
}

async function addQr(db, token, values) {
  db.addQr({
    ...values,
    tokenHash: await hashQrToken(token)
  });
}

test("registerPurchase creates a new anonymous customer", async () => {
  const db = new FakeD1();
  await addQr(db, "AAAAAAAAAAAA", { id: 1, publicNumber: 99 });

  const result = await registerPurchase(db, purchaseRequest(), "AAAAAAAAAAAA", {
    generateCustomerId: () => "cust_new"
  });

  assert.equal(result.ok, true);
  assert.equal(db.customers.has("cust_new"), true);
  assert.match(result.customerCookie, /GAMMS-AEP-Customer=cust_new/);
});

test("registerPurchase reuses an existing anonymous customer", async () => {
  const db = new FakeD1();
  db.customers.set("cust_existing", { id: "cust_existing" });
  await addQr(db, "BBBBBBBBBBBB", { id: 2, publicNumber: 100 });

  const result = await registerPurchase(
    db,
    purchaseRequest("GAMMS-AEP-Customer=cust_existing"),
    "BBBBBBBBBBBB"
  );

  assert.equal(result.ok, true);
  assert.equal(result.customerCookie, null);
  assert.equal(db.purchases[0].customer_id, "cust_existing");
});

test("available QR registers a purchase with product price and decrements stock", async () => {
  const db = new FakeD1();
  await addQr(db, "CCCCCCCCCCCC", { id: 3, publicNumber: 101 });

  const result = await registerPurchase(db, purchaseRequest(), "CCCCCCCCCCCC", {
    generateCustomerId: () => "cust_price"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.purchase, {
    qrNumber: 101,
    product: { id: 1, name: "Bebida" },
    priceCents: 4000,
    discountPercent: 0,
    finalPriceCents: 4000
  });
  assert.equal(db.products.get(1).stock_quantity, 49);
  assert.equal(db.inventoryMovements.length, 1);
  assert.equal(db.inventoryMovements[0].movement_type, "sale");
});

test("used, disabled, invalid, and productless QR requests are rejected safely", async () => {
  const db = new FakeD1();
  await addQr(db, "DDDDDDDDDDDD", { id: 4, publicNumber: 102, status: "used" });
  await addQr(db, "EEEEEEEEEEEE", { id: 5, publicNumber: 103, status: "disabled" });
  await addQr(db, "FFFFFFFFFFFF", { id: 6, publicNumber: 104, productId: 404 });

  assert.equal((await registerPurchase(db, purchaseRequest(), "DDDDDDDDDDDD")).code, "QR_ALREADY_USED");
  assert.equal((await registerPurchase(db, purchaseRequest(), "EEEEEEEEEEEE")).code, "QR_DISABLED");
  assert.equal((await registerPurchase(db, purchaseRequest(), "short")).code, "QR_INVALID");
  assert.equal((await registerPurchase(db, purchaseRequest(), "FFFFFFFFFFFF")).code, "PRODUCT_NOT_FOUND");
  assert.equal(db.purchases.length, 0);
});

test("purchase progress counts valid customer purchases and cycles every three", async () => {
  const db = new FakeD1();
  await addQr(db, "GGGGGGGGGGGG", { id: 7, publicNumber: 105 });
  db.purchases.push({
    id: 1,
    customer_id: "cust_progress",
    product_id: 1,
    qr_code_id: 90,
    regular_price_cents: 4000,
    discount_percent: 0,
    final_price_cents: 4000
  });

  const result = await registerPurchase(
    db,
    purchaseRequest("GAMMS-AEP-Customer=cust_progress"),
    "GGGGGGGGGGGG"
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.progress, {
    purchaseCount: 2,
    cyclePosition: 2,
    reward: {
      available: true,
      type: "third_drink_50",
      discountPercent: 50
    }
  });
});

test("two requests for the same QR produce only one purchase", async () => {
  const db = new FakeD1();
  await addQr(db, "HHHHHHHHHHHH", { id: 8, publicNumber: 106 });

  const [first, second] = await Promise.all([
    registerPurchase(db, purchaseRequest("GAMMS-AEP-Customer=cust_a"), "HHHHHHHHHHHH"),
    registerPurchase(db, purchaseRequest("GAMMS-AEP-Customer=cust_b"), "HHHHHHHHHHHH")
  ]);

  const results = [first, second];
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => ["QR_ALREADY_USED", "PURCHASE_CONFLICT"].includes(result.code)).length,
    1
  );
  assert.equal(db.purchases.length, 1);
  assert.equal(db.purchases.filter((purchase) => purchase.qr_code_id === 8).length, 1);
  assert.equal(db.qrCodes.get(await hashQrToken("HHHHHHHHHHHH")).status, "used");
});

test("purchase insert failure rolls back without consuming the QR", async () => {
  const db = new FakeD1();
  await addQr(db, "IIIIIIIIIIII", { id: 9, publicNumber: 107 });
  db.failNextPurchaseInsert = true;

  const result = await registerPurchase(db, purchaseRequest(), "IIIIIIIIIIII", {
    generateCustomerId: () => "cust_insert_fail"
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "PURCHASE_CONFLICT");
  assert.equal(db.purchases.length, 0);
  assert.equal(db.qrCodes.get(await hashQrToken("IIIIIIIIIIII")).status, "available");
});

test("OUT_OF_STOCK rejects purchase when stock is 0 and leaves QR available", async () => {
  const db = new FakeD1();
  db.products.get(1).stock_quantity = 0;
  await addQr(db, "OUTOFSTOCK12", { id: 99, publicNumber: 999 });

  const result = await registerPurchase(db, purchaseRequest(), "OUTOFSTOCK12");

  assert.equal(result.ok, false);
  assert.equal(result.code, "OUT_OF_STOCK");
  assert.equal(db.purchases.length, 0);
  assert.equal(db.qrCodes.get(await hashQrToken("OUTOFSTOCK12")).status, "available");
  assert.equal(db.inventoryMovements.length, 0);
});

test("stock update failure rolls back entire purchase transaction atomically", async () => {
  const db = new FakeD1();
  await addQr(db, "FAILSTOCKUPD", { id: 100, publicNumber: 800 });
  db.failNextStockUpdate = true;

  const result = await registerPurchase(db, purchaseRequest(), "FAILSTOCKUPD");

  assert.equal(result.ok, false);
  assert.equal(result.code, "PURCHASE_CONFLICT");
  assert.equal(db.purchases.length, 0);
  assert.equal(db.qrCodes.get(await hashQrToken("FAILSTOCKUPD")).status, "available");
  assert.equal(db.products.get(1).stock_quantity, 50);
});

test("inventory movement insert failure rolls back entire purchase transaction atomically", async () => {
  const db = new FakeD1();
  await addQr(db, "FAILINVENTOR", { id: 101, publicNumber: 801 });
  db.failNextInventoryInsert = true;

  const result = await registerPurchase(db, purchaseRequest(), "FAILINVENTOR");

  assert.equal(result.ok, false);
  assert.equal(result.code, "PURCHASE_CONFLICT");
  assert.equal(db.purchases.length, 0);
  assert.equal(db.qrCodes.get(await hashQrToken("FAILINVENTOR")).status, "available");
  assert.equal(db.products.get(1).stock_quantity, 50);
});

test("concurrency with stock=1 allows exactly 1 purchase and decrements stock to 0", async () => {
  const db = new FakeD1();
  db.products.get(1).stock_quantity = 1;
  await addQr(db, "CONCURRSTOCK1", { id: 102, publicNumber: 802 });
  await addQr(db, "CONCURRSTOCK2", { id: 103, publicNumber: 803 });

  const [first, second] = await Promise.all([
    registerPurchase(db, purchaseRequest("GAMMS-AEP-Customer=cust_conc1"), "CONCURRSTOCK1"),
    registerPurchase(db, purchaseRequest("GAMMS-AEP-Customer=cust_conc2"), "CONCURRSTOCK2")
  ]);

  const results = [first, second];
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(db.products.get(1).stock_quantity, 0);
  assert.equal(db.inventoryMovements.length, 1);
});
