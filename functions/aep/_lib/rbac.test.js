import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PERMISSIONS, BUILTIN_ROLES, resolveUserPermissions, canUserAssignPermissions } from './rbac.js';

test('RBAC - builtin permissions and roles structure', () => {
  assert.ok(BUILTIN_PERMISSIONS.length >= 30);
  assert.ok(BUILTIN_ROLES.Owner);
  assert.ok(BUILTIN_ROLES.Vendedor);
  assert.ok(BUILTIN_ROLES.Vendedor.permissions.includes('pos.access'));
  assert.strictEqual(BUILTIN_ROLES.Vendedor.permissions.includes('users.manage'), false);
});

test('RBAC - user permission resolution', () => {
  const roles = [
    { role_key: 'Vendedor', permissions: '["pos.access", "pos.redeem"]' },
    { role_key: 'Inventario', permissions: '["products.manage", "inventory.manage"]' }
  ];
  
  const resolved = resolveUserPermissions(roles);
  assert.strictEqual(resolved.has('pos.access'), true);
  assert.strictEqual(resolved.has('inventory.manage'), true);
  assert.strictEqual(resolved.has('users.manage'), false);
});

test('RBAC - privilege escalation checks', () => {
  const adminPerms = new Set(['users.manage', 'users.read', 'roles.read']);
  
  // Admin can assign subset of their permissions
  assert.strictEqual(canUserAssignPermissions(adminPerms, ['users.read']), true);
  
  // Admin CANNOT assign permission they don't possess
  assert.strictEqual(canUserAssignPermissions(adminPerms, ['system.manage']), false);
});
