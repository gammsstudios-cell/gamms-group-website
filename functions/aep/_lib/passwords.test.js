import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, legacySha256Hash, parseStoredHash } from './passwords.js';

test('Passwords - modern PBKDF2 hashing & verification', async () => {
  const password = 'SuperSecretPass123!';
  const stored = await hashPassword(password);
  
  assert.ok(stored.startsWith('pbkdf2:'));
  assert.strictEqual(await verifyPassword(password, stored), true);
  assert.strictEqual(await verifyPassword('WrongPassword', stored), false);
});

test('Passwords - legacy SHA256 verification and migration format', async () => {
  const rawPass = 'seller123';
  const legacyHash = await legacySha256Hash(rawPass);
  
  assert.strictEqual(await verifyPassword(rawPass, legacyHash), true);

  assert.strictEqual(await verifyPassword('wrong', legacyHash), false);
  
  const parsed = parseStoredHash(legacyHash);
  assert.strictEqual(parsed.algo, 'sha256');
});
