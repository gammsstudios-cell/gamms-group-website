// GAMMS AEP Unified Staff Authentication & Permission Middleware Helper
import { parseCookies } from "./cookies.js";
import { STAFF_COOKIE_NAME, verifyStaffSessionToken } from "./staffSessions.js";
import { ADMIN_COOKIE_NAME, verifyAdminSession } from "./adminAuth.js";

import { SELLER_COOKIE_NAME, verifySellerSession } from "./sellerAuth.js";
import { ALL_SYSTEM_PERMISSIONS, userHasPermission } from "./rbac.js";
import { errorJson } from "./responses.js";

/**
 * Authenticates any staff request (supports new Staff sessions, Owner ENV admin sessions, and legacy seller sessions).
 */
export async function authenticateStaff(request, env, db) {
  const cookies = parseCookies(request.headers.get("Cookie"));

  // 1. Try unified GAMMS-AEP-Staff cookie
  const staffToken = cookies.get(STAFF_COOKIE_NAME);
  if (staffToken) {
    const staffSession = await verifyStaffSessionToken(db, staffToken);
    if (staffSession) {
      return {
        authenticated: true,
        session: staffSession,
        actor: {
          type: "staff",
          identifier: staffSession.username,
          userId: staffSession.userId,
          displayName: staffSession.displayName,
          permissions: staffSession.permissions,
          isEnvOwner: false
        }
      };
    }
  }

  // 2. Try legacy Owner ENV / Admin session
  const adminToken = cookies.get(ADMIN_COOKIE_NAME);
  const adminResult = await verifyAdminSession(env, adminToken);
  if (adminResult.ok) {
    const username = env?.AEP_ADMIN_USERNAME || "admin";
    return {
      authenticated: true,
      session: {
        isStaffSession: true,
        isEnvOwner: true,
        userId: null,
        username,
        displayName: "Owner",
        mustChangePassword: false,
        roles: [{ id: 1, name: "Owner", is_builtin: 1 }],
        permissions: ALL_SYSTEM_PERMISSIONS
      },
      actor: {
        type: "admin",
        identifier: username,
        userId: null,
        displayName: "Owner",
        permissions: ALL_SYSTEM_PERMISSIONS,
        isEnvOwner: true
      }
    };
  }

  // 3. Try legacy seller session
  const sellerToken = cookies.get(SELLER_COOKIE_NAME);
  const sellerResult = await verifySellerSession(env, sellerToken);
  if (sellerResult.ok) {
    const sellerPerms = ["pos.access", "pos.redeem", "sales.read_own", "shifts.use", "sessions.read"];
    return {
      authenticated: true,
      session: {
        isStaffSession: true,
        isEnvOwner: false,
        userId: sellerResult.sellerId || 1,
        username: sellerResult.username || "vendedor",
        displayName: sellerResult.displayName || "Vendedor",
        mustChangePassword: false,
        roles: [{ id: 5, name: "Vendedor", is_builtin: 1 }],
        permissions: sellerPerms
      },
      actor: {
        type: "seller",
        identifier: sellerResult.displayName || "Vendedor",
        userId: sellerResult.sellerId || 1,
        displayName: sellerResult.displayName || "Vendedor",
        permissions: sellerPerms,
        isEnvOwner: false
      }
    };
  }

  return { authenticated: false };
}


/**
 * Requires staff authentication AND specific permission for an endpoint handler.
 * Returns null if authorized, or a Response object (401/403) if unauthorized.
 */
export async function requirePermission(request, env, db, requiredPermission) {
  const auth = await authenticateStaff(request, env, db);

  if (!auth.authenticated) {
    return {
      authorized: false,
      response: errorJson("SELLER_AUTH_REQUIRED", 401)
    };
  }

  if (requiredPermission && !userHasPermission(auth.actor.permissions, requiredPermission)) {
    return {
      authorized: false,
      response: errorJson("PERMISSION_DENIED", 403)
    };
  }


  return {
    authorized: true,
    session: auth.session,
    actor: auth.actor
  };
}
