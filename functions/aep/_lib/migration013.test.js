import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  hashPasswordPbkdf2,
  legacySha256Hash,
  verifyPassword,
  needsPasswordRehash,
  parseStoredHash,
  parseIterationCount,
  PBKDF2_TARGET_ITERATIONS,
  MAX_ACCEPTED_ITERATIONS
} from "./passwords.js";
import {
  base32Decode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpCodeForCounter,
  generateTotpSecret,
  verifyTotpCode,
  verifyTotpCodeWithReplay,
  consumeRecoveryCodeAtomic
} from "./totp.js";
import { onRequestPost as loginPost } from "../api/staff/login.js";
import { sha256Hex } from "./crypto.js";

const MFA_KEY_64 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

class TestD1 {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(sql) {
    return new TestStatement(this.sqlite, sql);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN TRANSACTION;");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.executeBatch());
      this.sqlite.exec("COMMIT;");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
    }
  }
}

class TestStatement {
  constructor(sqlite, sql) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params.map((param) => (param === undefined ? null : param));
    return this;
  }

  async run() {
    const info = this.sqlite.prepare(this.sql).run(...this.params);
    return { meta: { changes: info.changes } };
  }

  async first() {
    return this.sqlite.prepare(this.sql).get(...this.params) ?? null;
  }

  async all() {
    return { results: this.sqlite.prepare(this.sql).all(...this.params) };
  }

  async executeBatch() {
    const info = this.sqlite.prepare(this.sql).run(...this.params);
    return { meta: { changes: info.changes }, results: [] };
  }
}

function createFreshDb(upTo = "013") {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDir = resolve(process.cwd(), "database/migrations");
  for (const file of readdirSync(migrationsDir).filter((item) => item.endsWith(".sql")).sort()) {
    if (file.slice(0, 3) <= upTo) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      if (sql.trim()) sqlite.exec(sql);
    }
  }
  return new TestD1(sqlite);
}

test("Migration 013 creates the TOTP replay table with atomic monotonic state", async () => {
  const db = createFreshDb("013");
  const secret = generateTotpSecret();
  const timestampSec = 1_800_000_000;
  const step = Math.floor(timestampSec / 30);
  const otp = await generateTotpCodeForCounter(secret, step);

  const first = await verifyTotpCodeWithReplay(db, "staff:7", secret, otp, 1, timestampSec);
  assert.equal(first.valid, true);
  assert.equal(first.matchedStep, step);

  const replay = await verifyTotpCodeWithReplay(db, "staff:7", secret, otp, 1, timestampSec);
  assert.equal(replay.valid, false);
  assert.equal(replay.code, "MFA_REPLAYED");

  const nextOtp = await generateTotpCodeForCounter(secret, step + 1);
  const next = await verifyTotpCodeWithReplay(db, "staff:7", secret, nextOtp, 1, timestampSec + 30);
  assert.equal(next.valid, true);
  assert.equal(next.matchedStep, step + 1);
});

test("TOTP replay verification fails closed without durable replay state", async () => {
  const db = createFreshDb("013");
  const secret = generateTotpSecret();
  const timestampSec = 1_800_000_000;
  const otp = await generateTotpCode(secret, timestampSec);

  const noDb = await verifyTotpCodeWithReplay(null, "staff:7", secret, otp, 1, timestampSec);
  assert.equal(noDb.valid, false);
  assert.equal(noDb.code, "MFA_REPLAY_STATE_UNAVAILABLE");

  const noPrincipal = await verifyTotpCodeWithReplay(db, "", secret, otp, 1, timestampSec);
  assert.equal(noPrincipal.valid, false);
  assert.equal(noPrincipal.code, "MFA_REPLAY_STATE_UNAVAILABLE");
});

test("Password hardening accepts legacy formats and upgrades only when needed", async () => {
  const modern = await hashPasswordPbkdf2("ModernPass1");
  assert.equal(modern.iterations, PBKDF2_TARGET_ITERATIONS);
  assert.equal(PBKDF2_TARGET_ITERATIONS, 600000);
  assert.equal(await verifyPassword("ModernPass1", modern.hash, "pbkdf2-sha256", modern.salt, modern.iterations), true);
  assert.equal(needsPasswordRehash(modern.hash, "pbkdf2-sha256", modern.iterations), false);

  const legacyPbkdf2 = await hashPasswordPbkdf2("LegacyPass1", "0123456789abcdef0123456789abcdef", 10000);
  assert.equal(await verifyPassword("LegacyPass1", legacyPbkdf2.hash, "pbkdf2-sha256", legacyPbkdf2.salt, legacyPbkdf2.iterations), true);
  assert.equal(needsPasswordRehash(legacyPbkdf2.hash, "pbkdf2-sha256", legacyPbkdf2.iterations), true);

  const sha = await legacySha256Hash("ShaLegacy1");
  assert.equal(await verifyPassword("ShaLegacy1", sha, "sha256"), true);
  assert.equal(needsPasswordRehash(sha, "sha256", 0), true);
});

test("Malformed password hashes are rejected before unsafe crypto", async () => {
  assert.equal(parseStoredHash("pbkdf2:short:600000:" + "a".repeat(64)).valid, false);
  assert.equal(parseStoredHash("pbkdf2:" + "a".repeat(32) + ":NaN:" + "b".repeat(64)).valid, false);
  assert.equal(parseStoredHash("pbkdf2:" + "a".repeat(32) + ":" + (MAX_ACCEPTED_ITERATIONS + 1) + ":" + "b".repeat(64)).valid, false);
  assert.equal(parseStoredHash("pbkdf2:" + "a".repeat(32) + ":600000:not-hex").valid, false);
  assert.equal(await verifyPassword("x".repeat(300), "a".repeat(64), "sha256"), false);
});

test("PBKDF2 verification rejects a short wrong password without throwing", async () => {
  const stored = await hashPasswordPbkdf2("CorrectPass1");
  assert.equal(
    await verifyPassword("abc", stored.hash, "pbkdf2-sha256", stored.salt, stored.iterations),
    false
  );
});

test("PBKDF2 iteration parsing is strict for DB and stored-hash values", async () => {
  assert.equal(parseIterationCount(600000), 600000);
  assert.equal(parseIterationCount("600000"), 600000);

  for (const value of ["600000garbage", "600000.5", "+600000", "6e5", " 600000 ", NaN, Infinity]) {
    assert.equal(parseIterationCount(value), null);
  }

  for (const value of ["600000garbage", "600000.5", "+600000", "6e5", " 600000 "]) {
    const parsed = parseStoredHash(`pbkdf2:${"a".repeat(32)}:${value}:${"b".repeat(64)}`);
    assert.equal(parsed.valid, false);
  }
});

test("TOTP encryption fails closed and validates strict ciphertext/key formats", async () => {
  const secret = generateTotpSecret();
  await assert.rejects(() => encryptTotpSecret(secret, ""), /MFA_ENCRYPTION_KEY_NOT_CONFIGURED/);
  await assert.rejects(() => encryptTotpSecret(secret, "x".repeat(64)), /MFA_ENCRYPTION_KEY_NOT_CONFIGURED/);

  const encrypted = await encryptTotpSecret(secret, MFA_KEY_64);
  assert.match(encrypted, /^v1:[0-9a-f]{24}:[0-9a-f]+$/);
  assert.equal(await decryptTotpSecret(encrypted, MFA_KEY_64), secret);
  assert.equal(await decryptTotpSecret("v1:not-iv:not-body", MFA_KEY_64), null);
  assert.equal(base32Decode("INVALID_BASE32_189!"), null);
});

test("TOTP input must be six digits and uses timestampSec semantics", async () => {
  const secret = generateTotpSecret();
  const timestampSec = 1_800_000_000;
  const otp = await generateTotpCode(secret, timestampSec);
  assert.match(otp, /^\d{6}$/);

  assert.deepEqual(await verifyTotpCode(secret, "ABC123", 1, timestampSec), { valid: false, matchedStep: null });
  assert.equal((await verifyTotpCode(secret, otp, 1, timestampSec)).valid, true);
});

test("Recovery codes are 80-bit hash-only values and are atomically one-use", async () => {
  const db = createFreshDb("013");
  const { plainCodes, hashedCodes } = await generateRecoveryCodes();
  assert.equal(plainCodes.length, 8);
  assert.equal(hashedCodes.length, 8);
  assert.ok(plainCodes.every((code) => /^[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}$/.test(code)));
  assert.ok(hashedCodes.every((code) => /^[0-9a-f]{64}$/.test(code.hash) && code.used === false));
  assert.notEqual(plainCodes[0], hashedCodes[0].hash);

  await db.prepare(`
    INSERT INTO aep_users (id, username, username_normalized, display_name, password_hash, recovery_codes_json)
    VALUES (99, 'mfa-user', 'mfa-user', 'MFA User', ?, ?)
  `).bind("a".repeat(64), JSON.stringify(hashedCodes)).run();

  assert.equal((await consumeRecoveryCodeAtomic(db, 99, plainCodes[0])).valid, true);
  assert.equal((await consumeRecoveryCodeAtomic(db, 99, plainCodes[0])).valid, false);
});

test("Owner ENV login creates an Admin cookie, no staff session, and clears Staff/Seller cookies", async () => {
  const db = createFreshDb("013");
  const adminHash = await sha256Hex("OwnerSecretPass123");
  const env = {
    DB: db,
    AEP_ADMIN_USERNAME: "owner",
    AEP_ADMIN_PASSCODE_HASH: adminHash,
    AEP_ADMIN_SESSION_SECRET: "owner-session-secret"
  };

  const response = await loginPost({
    request: new Request("https://example.com/aep/api/staff/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "OwnerSecretPass123" })
    }),
    env
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.id, null);
  assert.equal(body.user.isEnvOwner, true);
  assert.equal((await db.prepare("SELECT COUNT(*) AS total FROM aep_staff_sessions").first()).total, 0);

  const setCookie = response.headers.getSetCookie
    ? response.headers.getSetCookie().join("; ")
    : (response.headers.get("set-cookie") ?? "");
  assert.match(setCookie, /GAMMS-AEP-Admin=/);
  assert.match(setCookie, /GAMMS-AEP-Staff=;/);
  assert.match(setCookie, /GAMMS-AEP-Seller=;/);
});

test("Staff login rejects short wrong PBKDF2 password with 401 instead of throwing", async () => {
  const db = createFreshDb("013");
  const stored = await hashPasswordPbkdf2("CorrectPass1");
  await db.prepare(`
    INSERT INTO aep_users (
      id, username, username_normalized, display_name,
      password_algo, password_hash, password_salt, password_iterations
    )
    VALUES (101, 'short-test', 'short-test', 'Short Test', 'pbkdf2-sha256', ?, ?, ?)
  `).bind(stored.hash, stored.salt, stored.iterations).run();

  const response = await loginPost({
    request: new Request("https://example.com/aep/api/staff/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "short-test", password: "abc" })
    }),
    env: { DB: db }
  });

  assert.equal(response.status, 401);
});

test("Owner username is reserved and cannot fall through to DB staff users", async () => {
  const db = createFreshDb("013");
  const staffHash = await hashPasswordPbkdf2("StaffSecret1");
  await db.prepare(`
    INSERT INTO aep_users (
      id, username, username_normalized, display_name,
      password_algo, password_hash, password_salt, password_iterations
    )
    VALUES (102, 'owner', 'owner', 'Owner DB User', 'pbkdf2-sha256', ?, ?, ?)
  `).bind(staffHash.hash, staffHash.salt, staffHash.iterations).run();

  const response = await loginPost({
    request: new Request("https://example.com/aep/api/staff/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "StaffSecret1" })
    }),
    env: {
      DB: db,
      AEP_ADMIN_USERNAME: "owner",
      AEP_ADMIN_PASSCODE_HASH: await sha256Hex("OwnerOnlySecret1"),
      AEP_ADMIN_SESSION_SECRET: "owner-session-secret"
    }
  });

  assert.equal(response.status, 401);
  assert.equal((await db.prepare("SELECT COUNT(*) AS total FROM aep_staff_sessions").first()).total, 0);
});

test("Owner MFA failures are rate-limited before creating an Admin session", async () => {
  const db = createFreshDb("013");
  const secret = generateTotpSecret();
  const env = {
    DB: db,
    AEP_ADMIN_USERNAME: "owner",
    AEP_ADMIN_PASSCODE_HASH: await sha256Hex("OwnerSecretPass123"),
    AEP_ADMIN_SESSION_SECRET: "owner-session-secret",
    AEP_ADMIN_TOTP_SECRET: secret
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await loginPost({
      request: new Request("https://example.com/aep/api/staff/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "owner", password: "OwnerSecretPass123", totpCode: "000000" })
      }),
      env
    });
    assert.equal(response.status, 401);
  }

  const locked = await loginPost({
    request: new Request("https://example.com/aep/api/staff/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "OwnerSecretPass123", totpCode: "000000" })
    }),
    env
  });

  assert.equal(locked.status, 429);
  const setCookie = locked.headers.getSetCookie
    ? locked.headers.getSetCookie().join("; ")
    : (locked.headers.get("set-cookie") ?? "");
  assert.doesNotMatch(setCookie, /GAMMS-AEP-Admin=/);
});
