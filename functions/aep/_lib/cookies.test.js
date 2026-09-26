import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_COOKIE_NAME,
  buildCustomerCookie,
  generateCustomerId,
  getCustomerIdFromRequest,
  parseCookies
} from "./cookies.js";

test("parseCookies reads named values", () => {
  const cookies = parseCookies("theme=dark; GAMMS-AEP-Customer=cust_abc123");

  assert.equal(cookies.get("theme"), "dark");
  assert.equal(cookies.get(CUSTOMER_COOKIE_NAME), "cust_abc123");
});

test("customer cookie is HttpOnly and Secure on HTTPS", () => {
  const request = new Request("https://example.com/aep/api/purchases");
  const cookie = buildCustomerCookie("cust_abc123", request);

  assert.match(cookie, /GAMMS-AEP-Customer=cust_abc123/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
});

test("customer ids are unpredictable tokens with the customer prefix", () => {
  const first = generateCustomerId();
  const second = generateCustomerId();

  assert.match(first, /^cust_[A-Za-z0-9]{32}$/);
  assert.notEqual(first, second);
});

test("getCustomerIdFromRequest reuses valid customer cookie", () => {
  const request = new Request("https://example.com/aep/api/purchases", {
    headers: { cookie: "GAMMS-AEP-Customer=cust_existing" }
  });

  assert.equal(getCustomerIdFromRequest(request), "cust_existing");
});
