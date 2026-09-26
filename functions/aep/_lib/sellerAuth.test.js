import assert from "node:assert/strict";
import test from "node:test";

import { sha256Hex } from "./crypto.js";
import {
  createSellerSession,
  loginSeller,
  requireSellerAuth,
  SELLER_COOKIE_NAME,
  verifySellerSession
} from "./sellerAuth.js";

test("seller login accepts the configured passcode hash", async () => {
  const env = {
    AEP_SELLER_PASSCODE_HASH: await sha256Hex("1234"),
    AEP_SELLER_SESSION_SECRET: "test-secret"
  };

  assert.equal((await loginSeller(env, "1234")).ok, true);
  assert.equal((await loginSeller(env, "wrong")).code, "SELLER_AUTH_INVALID");
});

test("seller auth reports missing secrets", async () => {
  const result = await loginSeller({}, "1234");

  assert.equal(result.ok, false);
  assert.equal(result.code, "SELLER_AUTH_NOT_CONFIGURED");
  assert.equal(result.status, 503);
});

test("seller session validates, expires, and rejects tampering", async () => {
  const env = {
    AEP_SELLER_PASSCODE_HASH: await sha256Hex("1234"),
    AEP_SELLER_SESSION_SECRET: "test-secret"
  };
  const now = Date.now();
  const session = await createSellerSession(env, now);

  assert.equal((await verifySellerSession(env, session, now + 1000)).ok, true);
  assert.equal((await verifySellerSession(env, session, now + 9 * 60 * 60 * 1000)).code, "SELLER_AUTH_REQUIRED");
  assert.equal((await verifySellerSession(env, `${session}tampered`, now + 1000)).code, "SELLER_AUTH_REQUIRED");
});

test("customer cookie does not authorize seller endpoints", async () => {
  const env = {
    AEP_SELLER_PASSCODE_HASH: await sha256Hex("1234"),
    AEP_SELLER_SESSION_SECRET: "test-secret"
  };
  const customerRequest = new Request("https://example.com/aep/api/seller/redeem", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_abc" }
  });
  const sellerSession = await createSellerSession(env);
  const sellerRequest = new Request("https://example.com/aep/api/seller/redeem", {
    headers: { cookie: `${SELLER_COOKIE_NAME}=${encodeURIComponent(sellerSession)}` }
  });

  assert.equal((await requireSellerAuth(customerRequest, env)).code, "SELLER_AUTH_REQUIRED");
  assert.equal((await requireSellerAuth(sellerRequest, env)).ok, true);
});
