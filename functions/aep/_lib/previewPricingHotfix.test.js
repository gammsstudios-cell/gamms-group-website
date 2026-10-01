import test from "node:test";
import assert from "node:assert/strict";

import { normalizePricing } from "../api/seller/claims/preview-product.js";
import { normalizePhysicalQrInput } from "./physicalQr.js";

test("POS pricing preview uses the current V2 reward percentage", () => {
  const pricing = normalizePricing(
    { pricing: { regularPriceCents: 4000, discountPercent: 50, finalPriceCents: 2000 } },
    { reward: { discountPercent: 25 } }
  );

  assert.deepEqual(pricing, {
    regularPriceCents: 4000,
    discountPercent: 25,
    finalPriceCents: 3000
  });
});

test("POS pricing preview uses current pre-linked claim pricing instead of legacy 50 fallback", () => {
  const pricing = normalizePricing(
    { pricing: { regularPriceCents: 4000, discountPercent: 50, finalPriceCents: 2000 } },
    { pricing: { discountPercent: 25 } }
  );

  assert.equal(pricing.discountPercent, 25);
  assert.equal(pricing.finalPriceCents, 3000);
});

test("100 percent reward previews as a zero-price purchase", () => {
  const pricing = normalizePricing(
    { pricing: { regularPriceCents: 3500, discountPercent: 50, finalPriceCents: 1750 } },
    { reward: { discountPercent: 100 } }
  );

  assert.equal(pricing.discountPercent, 100);
  assert.equal(pricing.finalPriceCents, 0);
});

test("staff physical QR input accepts public code token and promo URL", () => {
  const token = "ABCD1234EFGH";
  assert.deepEqual(normalizePhysicalQrInput("#127"), { type: "publicNumber", value: 127 });
  assert.deepEqual(normalizePhysicalQrInput("127"), { type: "publicNumber", value: 127 });
  assert.deepEqual(normalizePhysicalQrInput(token), { type: "token", value: token });
  assert.deepEqual(
    normalizePhysicalQrInput(`https://example.com/aep/promo/r/${token}`),
    { type: "token", value: token }
  );
});
