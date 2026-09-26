/**
 * All base system permissions list for validation and seeding.
 */
export const ALL_SYSTEM_PERMISSIONS = [
  "dashboard.read",
  "pos.access",
  "pos.redeem",
  "sales.read",
  "sales.read_own",
  "sales.export",
  "products.read",
  "products.manage",
  "inventory.read",
  "inventory.manage",
  "qr.read",
  "qr.generate",
  "qr.manage",
  "print.use",
  "print.manage_profiles",
  "rewards.read",
  "rewards.manage",
  "customers.read",
  "customers.manage",
  "users.read",
  "users.manage",
  "roles.read",
  "roles.manage",
  "sessions.read",
  "sessions.revoke",
  "shifts.use",
  "shifts.manage",
  "audit.read",
  "audit.export",
  "settings.read",
  "settings.manage",
  "system.read",
  "system.manage",
  "reports.read",
  "reports.export",
  "event.manage",
  "purchase.void",
  "security.mfa.manage"
];

export const BUILTIN_PERMISSIONS = ALL_SYSTEM_PERMISSIONS;

export const BUILTIN_ROLES = {
  Owner: { name: "Owner", permissions: ALL_SYSTEM_PERMISSIONS },
  Vendedor: { name: "Vendedor", permissions: ["pos.access", "pos.redeem", "sales.read_own", "shifts.use"] }
};



/**
 * Checks if a user's permission array contains a required permission.
 */
export function userHasPermission(userPermissions = [], requiredPermission) {
  if (!requiredPermission) return true;
  if (!Array.isArray(userPermissions)) return false;
  if (userPermissions.includes("*")) return true;
  return userPermissions.includes(requiredPermission);
}

export function resolveUserPermissions(roles = []) {
  const perms = new Set();
  for (const r of roles) {
    let pList = [];
    if (typeof r.permissions === "string") {
      try { pList = JSON.parse(r.permissions); } catch { pList = []; }
    } else if (Array.isArray(r.permissions)) {
      pList = r.permissions;
    }
    pList.forEach((p) => perms.add(p));
  }
  return perms;
}

export function canUserAssignPermissions(actorPermSet, requestedPermList) {
  for (const p of requestedPermList) {
    if (!actorPermSet.has(p) && !actorPermSet.has("*")) {
      return false;
    }
  }
  return true;
}

/**
 * Prevents privilege escalation: ensures target permissions are a subset of actor permissions.
 */
export function validateNoPrivilegeEscalation(actorPermissions, requestedPermissions) {
  if (actorPermissions.includes("*")) return { valid: true };

  const invalidKeys = requestedPermissions.filter(
    (p) => !actorPermissions.includes(p)
  );

  if (invalidKeys.length > 0) {
    return {
      valid: false,
      error: `Escalación de privilegios rechazada: No tienes permiso para otorgar (${invalidKeys.join(", ")})`
    };
  }

  return { valid: true };
}

/**
 * Fetches all permissions for a given user from DB.
 */
export async function getUserPermissions(db, userId, isEnvOwner = false) {
  if (isEnvOwner) {
    return ALL_SYSTEM_PERMISSIONS;
  }

  const rows = await db.prepare(`
    SELECT DISTINCT rp.permission_key
    FROM aep_user_roles ur
    JOIN aep_role_permissions rp ON ur.role_id = rp.role_id
    JOIN aep_roles r ON ur.role_id = r.id
    WHERE ur.user_id = ? AND r.active = 1
  `).bind(userId).all();

  return (rows?.results || []).map((r) => r.permission_key);
}

/**
 * Fetches user roles list from DB.
 */
export async function getUserRoles(db, userId, isEnvOwner = false) {
  if (isEnvOwner) {
    return [{ id: 1, name: "Owner", is_builtin: 1 }];
  }

  const rows = await db.prepare(`
    SELECT r.id, r.name, r.description, r.is_builtin
    FROM aep_user_roles ur
    JOIN aep_roles r ON ur.role_id = r.id
    WHERE ur.user_id = ? AND r.active = 1
  `).bind(userId).all();

  return rows?.results || [];
}
