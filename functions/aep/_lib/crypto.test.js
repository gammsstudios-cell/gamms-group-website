import test from "node:test";
import assert from "node:assert/strict";
import { generateQrToken, hashQrToken, isValidTokenFormat } from "./crypto.js";

test("hashQrToken is deterministic", async () => {
  const token = "7QK9X2PMA8T4";
  assert.equal(await hashQrToken(token), await hashQrToken(token));
});

test("different tokens produce different hashes", async () => {
  const first = await hashQrToken("7QK9X2PMA8T4");
  const second = await hashQrToken("8QK9X2PMA8T4");
  assert.notEqual(first, second);
});

test("generateQrToken creates valid unpredictable-looking base62 tokens", () => {
  const first = generateQrToken();
  const second = generateQrToken();

  assert.equal(first.length, 12);
  assert.equal(second.length, 12);
  assert.match(first, /^[0-9A-Za-z]{12}$/);
  assert.match(second, /^[0-9A-Za-z]{12}$/);
  assert.notEqual(first, second);
});

test("isValidTokenFormat rejects invalid token shapes", () => {
  assert.equal(isValidTokenFormat("short"), false);
  assert.equal(isValidTokenFormat("7QK9X2PMA8T4"), true);
  assert.equal(isValidTokenFormat("7QK9X2PMA8T!"), false);
});
