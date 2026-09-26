import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDisplayName, formatCustomerLabel, sanitizeDisplayName } from './customerProfile.js';

test('Customer Profile - validateDisplayName rules', () => {
  assert.strictEqual(validateDisplayName('Matthew').valid, true);
  assert.strictEqual(validateDisplayName('  Ana Sofía  ').valid, true);
  assert.strictEqual(validateDisplayName('  Ana Sofía  ').name, 'Ana Sofía');

  assert.strictEqual(validateDisplayName('A').valid, false); // < 2 chars
  assert.strictEqual(validateDisplayName('').valid, false);
  assert.strictEqual(validateDisplayName(null).valid, false);
  assert.strictEqual(validateDisplayName('   ').valid, false);
  assert.strictEqual(validateDisplayName('<script>alert(1)</script>').valid, false);
  assert.strictEqual(validateDisplayName('A'.repeat(61)).valid, false);
});

test('Customer Profile - formatCustomerLabel formatting', () => {
  assert.strictEqual(formatCustomerLabel('8cd8a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b'), 'Cliente #8CD8');
  assert.strictEqual(formatCustomerLabel(null), 'Cliente #0000');
});

test('Customer Profile - sanitizeDisplayName HTML escaping', () => {
  assert.strictEqual(sanitizeDisplayName('Matthew & Co.'), 'Matthew &amp; Co.');
  assert.strictEqual(sanitizeDisplayName('<b>User</b>'), '&lt;b&gt;User&lt;/b&gt;');
});
