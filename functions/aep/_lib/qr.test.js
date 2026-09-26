import test from "node:test";
import assert from "node:assert/strict";
import { lookupQrByToken } from "./qr.js";
import { hashQrToken } from "./crypto.js";

function createDb(rowsByHash) {
  return {
    prepare() {
      return {
        bind(tokenHash) {
          return {
            async first() {
              return rowsByHash[tokenHash] ?? null;
            }
          };
        }
      };
    }
  };
}

test("lookupQrByToken returns available QR with product", async () => {
  const token = "7QK9X2PMA8T4";
  const tokenHash = await hashQrToken(token);
  const db = createDb({
    [tokenHash]: {
      public_number: 47,
      status: "available",
      product_id: 1,
      product_name: "Bebida"
    }
  });

  assert.deepEqual(await lookupQrByToken(db, token), {
    ok: true,
    qr: { number: 47, status: "available" },
    product: { id: 1, name: "Bebida" }
  });
});

test("lookupQrByToken returns invalid for missing QR", async () => {
  const result = await lookupQrByToken(createDb({}), "7QK9X2PMA8T4");
  assert.deepEqual(result, { ok: false, code: "QR_INVALID" });
});

test("lookupQrByToken maps used status", async () => {
  const token = "7QK9X2PMA8T4";
  const tokenHash = await hashQrToken(token);
  const result = await lookupQrByToken(createDb({
    [tokenHash]: { public_number: 47, status: "used" }
  }), token);

  assert.deepEqual(result, { ok: false, code: "QR_ALREADY_USED" });
});

test("lookupQrByToken maps disabled status", async () => {
  const token = "7QK9X2PMA8T4";
  const tokenHash = await hashQrToken(token);
  const result = await lookupQrByToken(createDb({
    [tokenHash]: { public_number: 47, status: "disabled" }
  }), token);

  assert.deepEqual(result, { ok: false, code: "QR_DISABLED" });
});

test("lookupQrByToken rejects invalid token format before DB lookup", async () => {
  let called = false;
  const db = {
    prepare() {
      called = true;
      throw new Error("should not query");
    }
  };

  assert.deepEqual(await lookupQrByToken(db, "bad-token!"), {
    ok: false,
    code: "QR_INVALID"
  });
  assert.equal(called, false);
});
