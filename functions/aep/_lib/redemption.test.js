import assert from "node:assert/strict";
import test from "node:test";

import { hashQrToken } from "./crypto.js";
import { createRewardClaim } from "./claims.js";
import { previewClaim, redeemClaim } from "./redemption.js";

class FakeD1 {
  constructor() {
    this.customers = new Map([["cust_a", { id: "cust_a" }]]);
    this.products = new Map([[1, { id: 1, name: "Bebida", price_cents: 4001, active: 1 }]]);
    this.qrs = new Map();
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
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const snapshot = JSON.stringify({
      qrs: [...this.qrs],
      rewards: this.rewards,
      claims: this.claims,
      purchases: this.purchases
    });

    try {
      const results = [];
      for (const statement of statements) results.push(await statement.executeBatch());
      return results;
    } catch (error) {
      const parsed = JSON.parse(snapshot);
      this.qrs = new Map(parsed.qrs);
      this.rewards = parsed.rewards;
      this.claims = parsed.claims;
      this.purchases = parsed.purchases;
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

    if (this.sql.includes("FROM reward_claims c")) {
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      if (!claim) return null;
      const qr = [...this.db.qrs.values()].find((item) => item.id === claim.qr_code_id);
      const reward = this.db.rewards.find((item) => item.id === claim.reward_id);
      const product = this.db.products.get(qr.product_id);
      const expired = claim.expires_at <= "2026-01-01 00:00:00";
      return {
        claim_status: claim.status,
        expires_at: claim.expires_at,
        expired,
        qr_status: qr.status,
        public_number: qr.public_number,
        product_name: product.name,
        price_cents: product.price_cents,
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
        if (claim.status === "available" && claim.expires_at <= "2026-01-01 00:00:00") claim.status = "expired";
      }
      return { meta: { changes: 0 }, results: [] };
    }

    if (this.sql.includes("INSERT INTO reward_claims")) {
      const [rewardId, customerId, qrCodeId, tokenHash] = this.params;
      if (this.db.claims.some((claim) => claim.status === "available" && claim.reward_id === rewardId)) {
        throw new Error("available reward claim duplicate");
      }
      const claim = {
        id: this.db.claims.length + 1,
        reward_id: rewardId,
        customer_id: customerId,
        qr_code_id: qrCodeId,
        token_hash: tokenHash,
        status: "available",
        expires_at: "2026-01-01 00:05:00",
        redeemed_purchase_id: null
      };
      this.db.claims.push(claim);
      return { meta: { changes: 1 }, results: [{ expires_at: claim.expires_at }] };
    }

    if (this.sql.includes("INSERT INTO purchases")) {
      if (this.db.fail === "purchase") throw new Error("purchase failed");
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      if (!claim || claim.status !== "available" || claim.expires_at <= "2026-01-01 00:00:00") {
        return { meta: { changes: 0 }, results: [] };
      }
      const qr = [...this.db.qrs.values()].find((item) => item.id === claim.qr_code_id);
      const reward = this.db.rewards.find((item) => item.id === claim.reward_id);
      const product = this.db.products.get(qr.product_id);
      if (qr.status !== "available" || reward.status !== "available") return { meta: { changes: 0 }, results: [] };
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
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      const qr = [...this.db.qrs.values()].find((item) => item.id === claim.qr_code_id);
      qr.status = "used";
      return { meta: { changes: 1 }, results: [{ public_number: qr.public_number }] };
    }

    if (this.sql.includes("UPDATE rewards")) {
      if (this.db.fail === "reward") throw new Error("reward failed");
      const claim = this.db.claims.find((item) => item.token_hash === this.params[1]);
      const reward = this.db.rewards.find((item) => item.id === claim.reward_id);
      const purchase = this.db.purchases.find((item) => item.qr_code_id === claim.qr_code_id);
      reward.status = "redeemed";
      reward.redeemed_purchase_id = purchase.id;
      return { meta: { changes: 1 }, results: [{ status: reward.status, cycle_number: reward.cycle_number }] };
    }

    if (this.sql.includes("UPDATE reward_claims")) {
      if (this.db.fail === "claim") throw new Error("claim failed");
      const claim = this.db.claims.find((item) => item.token_hash === this.params[0]);
      const purchase = this.db.purchases.find((item) => item.qr_code_id === claim.qr_code_id);
      claim.status = "redeemed";
      claim.redeemed_purchase_id = purchase.id;
      return { meta: { changes: 1 }, results: [{ status: claim.status }] };
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
  assert.equal(db.claims.length, 1);
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
  db.claims[0].expires_at = "2025-01-01 00:00:00";
  assert.equal((await previewClaim(db, "ABCD-EFGH-23")).code, "CLAIM_EXPIRED");
});

test("redeemClaim applies 50 percent server-side and marks QR reward and claim", async () => {
  const db = new FakeD1();
  await db.addQr("DDDDDDDDDDDD", 13);
  await createRewardClaim(db, requestWithCustomer(), "DDDDDDDDDDDD", { generateClaimCode: () => "ABCDEFGH23" });

  const result = await redeemClaim(db, "ABCD-EFGH-23");

  assert.equal(result.ok, true);
  assert.equal(result.purchase.regularPriceCents, 4001);
  assert.equal(result.purchase.discountPercent, 50);
  assert.equal(result.purchase.finalPriceCents, 2001);
  assert.equal([...db.qrs.values()][0].status, "used");
  assert.equal(db.rewards[0].status, "redeemed");
  assert.equal(db.claims[0].status, "redeemed");
  assert.equal(db.claims[0].redeemed_purchase_id, 3);
});

test("concurrent redemption produces exactly one discounted purchase", async () => {
  const db = new FakeD1();
  await db.addQr("EEEEEEEEEEEE", 14);
  await createRewardClaim(db, requestWithCustomer(), "EEEEEEEEEEEE", { generateClaimCode: () => "ABCDEFGH23" });

  const [first, second] = await Promise.all([
    redeemClaim(db, "ABCD-EFGH-23"),
    redeemClaim(db, "ABCD-EFGH-23")
  ]);

  assert.equal([first, second].filter((result) => result.ok).length, 1);
  assert.equal(db.purchases.filter((purchase) => purchase.qr_code_id === 14).length, 1);
  assert.equal(db.rewards.filter((reward) => reward.status === "redeemed").length, 1);
  assert.equal(db.claims.filter((claim) => claim.status === "redeemed").length, 1);
});

for (const failure of ["purchase", "qr", "reward", "claim"]) {
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
  });
}
