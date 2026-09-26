import assert from "node:assert/strict";
import test from "node:test";

import { hashQrToken } from "./crypto.js";
import { createRewardClaim } from "./claims.js";
import { previewClaim, redeemClaim } from "./redemption.js";

class FakeD1 {
  constructor() {
    this.customers = new Map([["cust_a", { id: "cust_a" }]]);
    this.products = new Map([[1, { id: 1, name: "Bebida", price_cents: 4001, active: 1, stock_quantity: 5 }]]);
    this.qrs = new Map();
    this.inventoryMovements = [];
    this.rewards = [{
      id: 1,
      customer_id: "cust_a",
      reward_type: "third_drink_50",
      discount_percent: 50,
      status: "available",
      cycle_number: 1,
      redeemed_purchase_id: null
    }];
    this.claims = [];
    this.purchases = [
      { id: 1, customer_id: "cust_a", product_id: 1, qr_code_id: 90 },
      { id: 2, customer_id: "cust_a", product_id: 1, qr_code_id: 91 }
    ];
    this.fail = null;
    this.mutateBeforeClaimInsert = null;
    this.zeroChange = null;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const snapshot = {
      qrs: new Map(Array.from(this.qrs, ([key, value]) => [key, { ...value }])),
      rewards: this.rewards.map((row) => ({ ...row })),
      claims: this.claims.map((row) => ({ ...row })),
      purchases: this.purchases.map((row) => ({ ...row })),
      products: new Map(Array.from(this.products, ([key, value]) => [key, { ...value }])),
      inventoryMovements: this.inventoryMovements.map((row) => ({ ...row }))
    };

    try {
      const results = [];
      for (const statement of statements) results.push(await statement.executeBatch());
      return results;
    } catch (error) {
      this.qrs = snapshot.qrs;
      this.rewards = snapshot.rewards;
      this.claims = snapshot.claims;
      this.purchases = snapshot.purchases;
      this.products = snapshot.products;
      this.inventoryMovements = snapshot.inventoryMovements;
      throw error;
    }
  }

  async addQr(token, id = 10) {
    const tokenHash = await hashQrToken(token);
    this.qrs.set(tokenHash, {
      id,
      token_hash: tokenHash,
      public_number: id + 100,
      product_id: 1,
      status: "available"
    });
    return tokenHash;
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

  async first() {
    if (this.sql.includes("SELECT id FROM customers")) {
      return this.db.customers.get(this.params[0]) ?? null;
    }

    if (this.sql.includes("FROM rewards r") && this.sql.includes("JOIN qr_codes q")) {
      const [qrHash, customerId] = this.params;
      const qr = this.db.qrs.get(qrHash);
      const product = qr ? this.db.products.get(qr.product_id) : null;
      const reward = this.db.rewards.find((item) =>
        item.customer_id === customerId &&
        item.reward_type === "third_drink_50" &&
        item.status === "available" &&
        item.cycle_number === 1
      );
      if (!qr || qr.status !== "available" || !product || !reward) return null;
      return {
        reward_id: reward.id,
        discount_percent: reward.discount_percent,
        cycle_number: reward.cycle_number,
        qr_code_id: qr.id,
        public_number: qr.public_number,
        product_name: product.name
      };
    }

    if (this.sql.includes("FROM reward_claims c") && this.sql.includes("claim_status")) {
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      if (!claim) return null;
      const qr = [...this.db.qrs.values()].find((item) => item.id === claim.qr_code_id);
      const reward = this.db.rewards.find((item) => item.id === claim.reward_id);
      const product = this.db.products.get(qr.product_id);
      const expired = claim.expires_at <= "2026-01-01T00:00:00Z";
      return {
        claim_status: claim.status,
        expires_at: claim.expires_at,
        expired,
        qr_status: qr.status,
        public_number: qr.public_number,
        product_name: product.name,
        price_cents: product.price_cents,
        stock_quantity: product.stock_quantity,
        reward_status: reward.status,
        discount_percent: reward.discount_percent
      };
    }

    if (this.sql.includes("SELECT name FROM products")) {
      return this.db.products.get(this.params[0]) ?? null;
    }

    if (this.sql.includes("COUNT(*) AS purchase_count")) {
      return {
        purchase_count: this.db.purchases.filter((purchase) => purchase.customer_id === this.params[0]).length
      };
    }

    if (this.sql.includes("FROM reward_claims c") && this.sql.includes("JOIN rewards r")) {
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      if (!claim) return null;
      const qr = [...this.db.qrs.values()].find((item) => item.id === claim.qr_code_id);
      const reward = this.db.rewards.find((item) => item.id === claim.reward_id);
      const product = this.db.products.get(qr.product_id);
      return {
        discount_percent: reward.discount_percent,
        cycle_number: reward.cycle_number,
        public_number: qr.public_number,
        product_name: product.name
      };
    }

    throw new Error(`Unhandled first SQL: ${this.sql}`);
  }

  async executeBatch() {
    if (this.sql.includes("SET status = 'cancelled'")) {
      const [rewardId, qrCodeId] = this.params;
      for (const claim of this.db.claims) {
        if (claim.status === "available" && (claim.reward_id === rewardId || claim.qr_code_id === qrCodeId)) {
          claim.status = "cancelled";
        }
      }
      return { meta: { changes: 1 }, results: [] };
    }

    if (this.sql.includes("SET status = 'expired'")) {
      for (const claim of this.db.claims) {
        if (claim.status === "available" && claim.expires_at <= "2026-01-01T00:00:00Z") claim.status = "expired";
      }
      return { meta: { changes: 0 }, results: [] };
    }

    if (this.sql.includes("INSERT INTO reward_claims")) {
      this.db.mutateBeforeClaimInsert?.(this.db);
      this.db.mutateBeforeClaimInsert = null;

      const [customerId, tokenHash, qrHash] = this.params;
      const qr = this.db.qrs.get(qrHash);
      const product = qr ? this.db.products.get(qr.product_id) : null;
      const purchaseCount = this.db.purchases.filter((purchase) => purchase.customer_id === customerId).length;
      const cycleNumber = Math.floor((purchaseCount - 1) / 3) + 1;
      const reward = this.db.rewards.find((item) =>
        item.customer_id === customerId &&
        item.reward_type === "third_drink_50" &&
        item.status === "available" &&
        item.cycle_number === cycleNumber
      );

      if (!qr || qr.status !== "available" || !product || product.active !== 1 || !reward) {
        return { meta: { changes: 0 }, results: [] };
      }

      if (this.db.claims.some((claim) => claim.status === "available" && claim.reward_id === reward.id)) {
        throw new Error("available reward claim duplicate");
      }
      const claim = {
        id: this.db.claims.length + 1,
        reward_id: reward.id,
        customer_id: customerId,
        qr_code_id: qr.id,
        token_hash: tokenHash,
        status: "available",
        expires_at: "2026-01-01T00:05:00Z",
        redeemed_purchase_id: null
      };
      this.db.claims.push(claim);
      return {
        meta: { changes: 1 },
        results: [{ expires_at: claim.expires_at, reward_id: claim.reward_id, qr_code_id: claim.qr_code_id }]
      };
    }

    if (this.sql.includes("INSERT INTO purchases")) {
      if (this.db.fail === "purchase") throw new Error("purchase failed");
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      if (!claim || claim.status !== "available" || claim.expires_at <= "2026-01-01T00:00:00Z") {
        return { meta: { changes: 0 }, results: [] };
      }
      const qr = [...this.db.qrs.values()].find((item) => item.id === claim.qr_code_id);
      const reward = this.db.rewards.find((item) => item.id === claim.reward_id);
      const product = this.db.products.get(qr.product_id);
      if (qr.status !== "available" || reward.status !== "available" || product.stock_quantity <= 0) {
        return { meta: { changes: 0 }, results: [] };
      }
      if (this.db.purchases.some((purchase) => purchase.qr_code_id === qr.id)) throw new Error("duplicate purchase");
      const purchase = {
        id: this.db.purchases.length + 1,
        customer_id: claim.customer_id,
        product_id: product.id,
        qr_code_id: qr.id,
        regular_price_cents: product.price_cents,
        discount_percent: reward.discount_percent,
        final_price_cents: Math.round(product.price_cents * (100 - reward.discount_percent) / 100)
      };
      this.db.purchases.push(purchase);
      return { meta: { changes: 1 }, results: [purchase] };
    }

    if (this.sql.includes("UPDATE qr_codes")) {
      if (this.db.fail === "qr") throw new Error("qr failed");
      if (this.db.zeroChange === "qr") return { meta: { changes: 0 }, results: [] };
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      const qr = [...this.db.qrs.values()].find((item) => item.id === claim.qr_code_id);
      const purchase = this.db.purchases.find((item) => item.qr_code_id === claim.qr_code_id);
      if (!purchase) return { meta: { changes: 0 }, results: [] };
      qr.status = "used";
      return { meta: { changes: 1 }, results: [{ public_number: qr.public_number }] };
    }

    if (this.sql.includes("UPDATE rewards")) {
      if (this.db.fail === "reward") throw new Error("reward failed");
      if (this.db.zeroChange === "reward") return { meta: { changes: 0 }, results: [] };
      const claim = this.db.claims.find((item) => item.token_hash === this.params[1]);
      const reward = this.db.rewards.find((item) => item.id === claim.reward_id);
      const purchase = this.db.purchases.find((item) => item.qr_code_id === claim.qr_code_id);
      if (!purchase) return { meta: { changes: 0 }, results: [] };
      reward.status = "redeemed";
      reward.redeemed_purchase_id = purchase.id;
      return { meta: { changes: 1 }, results: [{ status: reward.status, cycle_number: reward.cycle_number }] };
    }

    if (this.sql.includes("UPDATE reward_claims")) {
      if (this.db.fail === "claim") throw new Error("claim failed");
      if (this.db.zeroChange === "claim") return { meta: { changes: 0 }, results: [] };
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      const purchase = this.db.purchases.find((item) => item.qr_code_id === claim.qr_code_id);
      if (!purchase) return { meta: { changes: 0 }, results: [] };
      claim.status = "redeemed";
      claim.redeemed_purchase_id = purchase.id;
      return { meta: { changes: 1 }, results: [{ status: claim.status }] };
    }

    if (this.sql.includes("UPDATE products")) {
      if (this.db.fail === "stock") throw new Error("stock failed");
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      const qr = [...this.db.qrs.values()].find((item) => item.id === claim.qr_code_id);
      const purchase = this.db.purchases.find((item) => item.qr_code_id === claim.qr_code_id);
      const product = this.db.products.get(qr.product_id);
      if (!purchase) return { meta: { changes: 0 }, results: [] };
      if (!product || product.stock_quantity <= 0) return { meta: { changes: 0 }, results: [] };
      product.stock_quantity -= 1;
      return { meta: { changes: 1 }, results: [] };
    }

    if (this.sql.includes("INSERT INTO inventory_movements")) {
      if (this.db.fail === "inventory") throw new Error("inventory failed");
      const claimHash = this.params[this.params.length - 1];
      const claim = this.db.claims.find((item) => item.token_hash === claimHash);
      const purchase = this.db.purchases.find((item) => item.qr_code_id === claim.qr_code_id);
      if (!purchase) return { meta: { changes: 0 }, results: [] };
      if (this.db.inventoryMovements.some((movement) => movement.purchase_id === purchase.id && movement.movement_type === "sale")) {
        throw new Error("duplicate sale inventory movement");
      }
      this.db.inventoryMovements.push({
        id: this.db.inventoryMovements.length + 1,
        product_id: purchase.product_id,
        movement_type: "sale",
        quantity_delta: -1,
        purchase_id: purchase.id,
        reason: this.params[0],
        actor_type: this.params[1],
        actor_identifier: this.params[2]
      });
      return { meta: { changes: 1 }, results: [] };
    }

    throw new Error(`Unhandled batch SQL: ${this.sql}`);
  }
}

function requestWithCustomer() {
  return new Request("https://example.com/aep/api/rewards/claim", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_a" }
  });
}

test("claim codes normalize, reject ambiguous formats, and create a valid claim", async () => {
  const db = new FakeD1();
  await db.addQr("AAAAAAAAAAAA", 10);

  const result = await createRewardClaim(db, requestWithCustomer(), "AAAAAAAAAAAA", {
    generateClaimCode: () => "ABCDEFGH23"
  });

  assert.equal(result.ok, true);
  assert.equal(result.claim.code, "ABCD-EFGH-23");
  assert.match(result.claim.qrSvg, /<svg/);
  assert.match(result.claim.expiresAt, /Z$/);
  assert.equal(db.claims.length, 1);
});

test("claim creation revalidates reward QR and product inside the batch", async () => {
  for (const scenario of ["reward", "qr", "product"]) {
    const db = new FakeD1();
    await db.addQr("GGGGGGGGGGGG", 16);
    db.mutateBeforeClaimInsert = (database) => {
      if (scenario === "reward") database.rewards[0].status = "redeemed";
      if (scenario === "qr") database.qrs.get([...database.qrs.keys()][0]).status = "used";
      if (scenario === "product") database.products.get(1).active = 0;
    };

    const result = await createRewardClaim(db, requestWithCustomer(), "GGGGGGGGGGGG", {
      generateClaimCode: () => "ABCDEFGH23"
    });

    assert.equal(result.ok, false, scenario);
    assert.equal(db.claims.length, 0, scenario);
  }
});

test("two concurrent createRewardClaim calls leave at most one available claim", async () => {
  const db = new FakeD1();
  await db.addQr("HHHHHHHHHHHH", 17);

  const [first, second] = await Promise.all([
    createRewardClaim(db, requestWithCustomer(), "HHHHHHHHHHHH", { generateClaimCode: () => "ABCDEFGH23" }),
    createRewardClaim(db, requestWithCustomer(), "HHHHHHHHHHHH", { generateClaimCode: () => "JKLMNPQR45" })
  ]);

  assert.equal([first, second].filter((result) => result.ok).length, 2);
  assert.equal(db.claims.filter((claim) => claim.status === "available").length, 1);
});

test("new claim cancels the previous available claim for the same reward", async () => {
  const db = new FakeD1();
  await db.addQr("BBBBBBBBBBBB", 11);

  await createRewardClaim(db, requestWithCustomer(), "BBBBBBBBBBBB", { generateClaimCode: () => "ABCDEFGH23" });
  await createRewardClaim(db, requestWithCustomer(), "BBBBBBBBBBBB", { generateClaimCode: () => "JKLMNPQR45" });

  assert.equal(db.claims.filter((claim) => claim.status === "available").length, 1);
  assert.equal(db.claims[0].status, "cancelled");
});

test("preview rejects expired claim and accepts available claim", async () => {
  const db = new FakeD1();
  await db.addQr("CCCCCCCCCCCC", 12);
  await createRewardClaim(db, requestWithCustomer(), "CCCCCCCCCCCC", { generateClaimCode: () => "ABCDEFGH23" });

  assert.equal((await previewClaim(db, "ABCD-EFGH-23")).ok, true);
  db.claims[0].expires_at = "2025-01-01T00:00:00Z";
  assert.equal((await previewClaim(db, "ABCD-EFGH-23")).code, "CLAIM_EXPIRED");
});

test("redeemClaim applies 50 percent server-side and records inventory sale", async () => {
  const db = new FakeD1();
  await db.addQr("DDDDDDDDDDDD", 13);
  await createRewardClaim(db, requestWithCustomer(), "DDDDDDDDDDDD", { generateClaimCode: () => "ABCDEFGH23" });

  const result = await redeemClaim(db, "ABCD-EFGH-23");

  assert.equal(result.ok, true);
  assert.equal(result.purchase.regularPriceCents, 4001);
  assert.equal(result.purchase.discountPercent, 50);
  assert.equal(result.purchase.finalPriceCents, 2001);
  assert.equal(db.products.get(1).stock_quantity, 4);
  assert.equal(db.inventoryMovements.length, 1);
  assert.equal(db.inventoryMovements[0].movement_type, "sale");
  assert.equal(db.inventoryMovements[0].quantity_delta, -1);
  assert.equal([...db.qrs.values()][0].status, "used");
  assert.equal(db.rewards[0].status, "redeemed");
  assert.equal(db.claims[0].status, "redeemed");
  assert.equal(db.claims[0].redeemed_purchase_id, 3);
});

test("OUT_OF_STOCK blocks redemption and leaves reward claim and QR intact", async () => {
  const db = new FakeD1();
  db.products.get(1).stock_quantity = 0;
  await db.addQr("NOSTOCKREDEM", 19);
  await createRewardClaim(db, requestWithCustomer(), "NOSTOCKREDEM", { generateClaimCode: () => "ABCDEFGH23" });

  const result = await redeemClaim(db, "ABCD-EFGH-23");

  assert.equal(result.ok, false);
  assert.equal(result.code, "OUT_OF_STOCK");
  assert.equal(db.purchases.length, 2);
  assert.equal([...db.qrs.values()][0].status, "available");
  assert.equal(db.rewards[0].status, "available");
  assert.equal(db.claims[0].status, "available");
  assert.equal(db.inventoryMovements.length, 0);
});

test("concurrent redemption with stock 1 creates one purchase and one sale movement", async () => {
  const db = new FakeD1();
  db.products.get(1).stock_quantity = 1;
  await db.addQr("EEEEEEEEEEEE", 14);
  await createRewardClaim(db, requestWithCustomer(), "EEEEEEEEEEEE", { generateClaimCode: () => "ABCDEFGH23" });

  const [first, second] = await Promise.all([
    redeemClaim(db, "ABCD-EFGH-23"),
    redeemClaim(db, "ABCD-EFGH-23")
  ]);

  assert.equal([first, second].filter((result) => result.ok).length, 1);
  assert.equal(db.purchases.filter((purchase) => purchase.qr_code_id === 14).length, 1);
  assert.equal(db.products.get(1).stock_quantity, 0);
  assert.equal(db.inventoryMovements.filter((movement) => movement.movement_type === "sale").length, 1);
  assert.equal(db.rewards.filter((reward) => reward.status === "redeemed").length, 1);
  assert.equal(db.claims.filter((claim) => claim.status === "redeemed").length, 1);
});

for (const failure of ["purchase", "qr", "reward", "claim", "stock", "inventory"]) {
  test(`redemption rollback when ${failure} step fails`, async () => {
    const db = new FakeD1();
    await db.addQr("FFFFFFFFFFFF", 15);
    await createRewardClaim(db, requestWithCustomer(), "FFFFFFFFFFFF", { generateClaimCode: () => "ABCDEFGH23" });
    db.fail = failure;

    const result = await redeemClaim(db, "ABCD-EFGH-23");

    assert.equal(result.ok, false);
    assert.equal(db.purchases.filter((purchase) => purchase.qr_code_id === 15).length, 0);
    assert.equal([...db.qrs.values()][0].status, "available");
    assert.equal(db.rewards[0].status, "available");
    assert.equal(db.claims[0].status, "available");
    assert.equal(db.products.get(1).stock_quantity, 5);
    assert.equal(db.inventoryMovements.length, 0);
  });
}

for (const mutation of ["qr", "reward", "claim"]) {
  test(`redemption rejects when ${mutation} mutation changes zero rows`, async () => {
    const db = new FakeD1();
    await db.addQr("JJJJJJJJJJJJ", 18);
    await createRewardClaim(db, requestWithCustomer(), "JJJJJJJJJJJJ", { generateClaimCode: () => "ABCDEFGH23" });
    db.zeroChange = mutation;

    const result = await redeemClaim(db, "ABCD-EFGH-23");

    assert.equal(result.ok, false);
    assert.equal(result.code, "REDEMPTION_CONFLICT");
  });
}
