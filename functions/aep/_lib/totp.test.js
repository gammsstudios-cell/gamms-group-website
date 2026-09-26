import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTotpSecret, generateTotpCode, verifyTotpCode, generateRecoveryCodes, encryptSecret, decryptSecret } from './totp.js';

test('TOTP - secret generation & encryption', async () => {
  const encKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const secret = generateTotpSecret();
  assert.ok(secret.length >= 16);

  const encrypted = await encryptSecret(secret, encKey);
  assert.match(encrypted, /^v1:[0-9a-f]{24}:[0-9a-f]+$/);

  const decrypted = await decryptSecret(encrypted, encKey);
  assert.strictEqual(decrypted, secret);
});

test('TOTP - code calculation & verification window', async () => {
  const secret = generateTotpSecret();
  
  const code = await generateTotpCode(secret);
  assert.strictEqual(code.length, 6);

  const isValid = await verifyTotpCode(secret, code);
  assert.strictEqual(isValid.valid, true);

  const isInvalid = await verifyTotpCode(secret, '000000');
  assert.strictEqual(isInvalid.valid, false);
});


test('TOTP - recovery code generation & hashing', async () => {
  const { plainCodes, hashedCodes } = await generateRecoveryCodes(8);
  assert.strictEqual(plainCodes.length, 8);
  assert.strictEqual(hashedCodes.length, 8);
  assert.ok(plainCodes.every((code) => /^[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}$/.test(code)));
  assert.notStrictEqual(plainCodes[0], hashedCodes[0]);
});
