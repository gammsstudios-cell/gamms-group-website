import assert from "node:assert/strict";
import test from "node:test";

import { hashQrToken } from "./crypto.js";
import { registerPurchase } from "./purchases.js";

class FakeD1 {
  constructor() {
    this.products = new Map([[1, { id: 1, name: "Bebida", price_cents: 4000, active: 1 }]]);
    this.customers = new Map();
    this.qrCodes = new Map();
    this.purchases = [];
    this.failNextPurchaseInsert = false;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const snapshot = {
      qrCodes: new Map(Array.from(this.qrCodes, ([key, value]) => [key, { ...value }])),
      purchases: this.purchases.map((purchase) => ({ ...purchase }))
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
    if (this.sql.includes("FROM qr_codes q")) {
      const [tokenHash] = this.params;
      const qr = this.db.qrCodes.get(tokenHash);
      if (!qr) return null;
      const product = this.db.products.get(qr.product_id);

      return {
        status: qr.status,
        product_id: qr.product_id,
        valid_product_id: product?.active === 1 ? product.id : null,
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

      const [customerId, tokenHash] = this.params;
      const qr = this.db.qrCodes.get(tokenHash);
      const product = qr ? this.db.products.get(qr.product_id) : null;

      if (!qr || qr.status !== "available" || !product || product.active !== 1) {
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

test("available QR registers a purchase with product price", async () => {
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
    cyclePosition: 2
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
