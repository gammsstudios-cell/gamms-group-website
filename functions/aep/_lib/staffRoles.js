// GAMMS AEP Staff Roles & Permissions Management Library
import { ALL_SYSTEM_PERMISSIONS, validateNoPrivilegeEscalation } from "./rbac.js";
import { logAuditEvent } from "./audit.js";

/**
 * Lists all system permissions with category/metadata.
 */
export async function listAllPermissions(db) {
  const rows = await db.prepare("SELECT key, name, description FROM aep_permissions ORDER BY key ASC").all();
  return rows?.results || [];
}

/**
 * Lists all roles and their assigned permissions.
 */
export async function listRoles(db) {
  const roles = await db.prepare("SELECT id, name, description, is_builtin, active, created_at FROM aep_roles ORDER BY id ASC").all();
  const roleList = roles?.results || [];

  for (const r of roleList) {
    const perms = await db.prepare(`
      SELECT permission_key FROM aep_role_permissions WHERE role_id = ?
    `).bind(r.id).all();
    r.permissions = (perms?.results || []).map((p) => p.permission_key);
  }

  return roleList;
}

/**
 * Gets details for a specific role.
 */
export async function getRoleById(db, roleId) {
  const r = await db.prepare("SELECT id, name, description, is_builtin, active, created_at FROM aep_roles WHERE id = ?").bind(roleId).first();
  if (!r) return null;

  const perms = await db.prepare("SELECT permission_key FROM aep_role_permissions WHERE role_id = ?").bind(r.id).all();
  r.permissions = (perms?.results || []).map((p) => p.permission_key);
  return r;
}

/**
 * Creates a new custom role.
 */
export async function createRole(db, actor, roleData) {
  if (!roleData.name || typeof roleData.name !== "string" || roleData.name.trim().length < 2) {
    return { valid: false, error: "El nombre del rol debe tener al menos 2 caracteres" };
  }

  const cleanName = roleData.name.trim();
  const existing = await db.prepare("SELECT id FROM aep_roles WHERE LOWER(name) = LOWER(?)").bind(cleanName).first();
  if (existing) {
    return { valid: false, error: "Ya existe un rol con ese nombre" };
  }

  const requestedPermissions = Array.isArray(roleData.permissions) ? roleData.permissions : [];

  // Check privilege escalation: actor must hold all permissions being assigned
  const escVal = validateNoPrivilegeEscalation(actor.permissions || [], requestedPermissions);
  if (!escVal.valid) return escVal;

  const stmt = await db.prepare(`
    INSERT INTO aep_roles (name, description, is_builtin, active)
    VALUES (?, ?, 0, 1)
    RETURNING id
  `).bind(cleanName, roleData.description || null).first();

  const roleId = stmt.id;

  for (const pKey of requestedPermissions) {
    if (ALL_SYSTEM_PERMISSIONS.includes(pKey)) {
      await db.prepare("INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key) VALUES (?, ?)").bind(roleId, pKey).run();
    }
  }

  await logAuditEvent(db, {
    actorType: actor.type || "admin",
    actorIdentifier: actor.identifier || "admin",
    action: "staff.role.created",
    entityType: "staff_role",
    entityIdentifier: String(roleId),
    metadata: { name: cleanName, permissions: requestedPermissions }
  });

  return { valid: true, roleId, name: cleanName };
}

/**
 * Updates a role's permissions or name.
 */
export async function updateRole(db, actor, roleId, updates) {
  const target = await getRoleById(db, roleId);
  if (!target) return { valid: false, error: "Rol no encontrado" };

  if (target.is_builtin && updates.name && updates.name !== target.name) {
    return { valid: false, error: "No se puede renombrar un rol del sistema predefinido" };
  }

  if (updates.name !== undefined) {
    const cleanName = updates.name.trim();
    if (cleanName.length < 2) return { valid: false, error: "Nombre inválido" };
    await db.prepare("UPDATE aep_roles SET name = ? WHERE id = ?").bind(cleanName, roleId).run();
  }

  if (updates.description !== undefined) {
    await db.prepare("UPDATE aep_roles SET description = ? WHERE id = ?").bind(updates.description || null, roleId).run();
  }

  if (Array.isArray(updates.permissions)) {
    const escVal = validateNoPrivilegeEscalation(actor.permissions || [], updates.permissions);
    if (!escVal.valid) return escVal;

    await db.prepare("DELETE FROM aep_role_permissions WHERE role_id = ?").bind(roleId).run();
    for (const pKey of updates.permissions) {
      if (ALL_SYSTEM_PERMISSIONS.includes(pKey)) {
        await db.prepare("INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key) VALUES (?, ?)").bind(roleId, pKey).run();
      }
    }

    // Increment session version of all users with this role to trigger permission refresh
    await db.prepare(`
      UPDATE aep_staff_sessions
      SET session_version = session_version + 1
      WHERE user_id IN (SELECT user_id FROM aep_user_roles WHERE role_id = ?)
    `).bind(roleId).run();
  }

  await logAuditEvent(db, {
    actorType: actor.type || "admin",
    actorIdentifier: actor.identifier || "admin",
    action: "staff.role.updated",
    entityType: "staff_role",
    entityIdentifier: String(roleId),
    metadata: updates
  });

  return { valid: true };
}
