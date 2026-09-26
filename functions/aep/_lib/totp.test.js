import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTotpSecret, generateTotpCode, verifyTotpCode, generateRecoveryCodes, encryptSecret, decryptSecret } from './totp.js';

test('TOTP - secret generation & encryption', async () => {
  const encKey = '12345678901234567890123456789012'; // 32 chars
  const secret = generateTotpSecret();
  assert.ok(secret.length >= 16);

  const encrypted = await encryptSecret(secret, encKey);
  assert.ok(encrypted.includes(':'));

  const decrypted = await decryptSecret(encrypted, encKey);
  assert.strictEqual(decrypted, secret);
});

test('TOTP - code calculation & verification window', async () => {
  const secret = generateTotpSecret();
  
  const code = await generateTotpCode(secret);
  assert.strictEqual(code.length, 6);

  const isValid = await verifyTotpCode(secret, code);
  assert.strictEqual(isValid, true);

  const isInvalid = await verifyTotpCode(secret, '000000');
  assert.strictEqual(isInvalid, false);
});


test('TOTP - recovery code generation & hashing', async () => {
  const { plainCodes, hashedCodes } = await generateRecoveryCodes(8);
  assert.strictEqual(plainCodes.length, 8);
  assert.strictEqual(hashedCodes.length, 8);
  assert.notStrictEqual(plainCodes[0], hashedCodes[0]);
});
