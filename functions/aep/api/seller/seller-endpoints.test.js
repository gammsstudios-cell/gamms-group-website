import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as preview } from "./claims/[code].js";
import { onRequestPost as redeem } from "./redeem.js";

test("seller preview and redeem reject missing seller session", async () => {
  const env = {
    AEP_SELLER_PASSCODE_HASH: "0".repeat(64),
    AEP_SELLER_SESSION_SECRET: "test-secret",
    DB: {}
  };

  const previewResponse = await preview({
    request: new Request("https://example.com/aep/api/seller/claims/ABCD-EFGH-23"),
    env,
    params: { code: "ABCD-EFGH-23" }
  });
  const redeemResponse = await redeem({
    request: new Request("https://example.com/aep/api/seller/redeem", {
      method: "POST",
      body: JSON.stringify({ claimCode: "ABCD-EFGH-23" })
    }),
    env
  });

  assert.equal(previewResponse.status, 401);
  assert.equal((await previewResponse.json()).code, "SELLER_AUTH_REQUIRED");
  assert.equal(redeemResponse.status, 401);
  assert.equal((await redeemResponse.json()).code, "SELLER_AUTH_REQUIRED");
});
