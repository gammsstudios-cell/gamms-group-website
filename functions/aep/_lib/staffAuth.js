// GAMMS AEP Unified Staff Authentication & Permission Middleware Helper
import { parseCookies } from "./cookies.js";
import { STAFF_COOKIE_NAME, verifyStaffSessionToken } from "./staffSessions.js";
import { ADMIN_COOKIE_NAME, verifyAdminSession } from "./adminAuth.js";
import { ALL_SYSTEM_PERMISSIONS, userHasPermission } from "./rbac.js";
import { errorJson } from "./responses.js";

/**
 * Authenticates any staff request (supports Staff sessions and Owner ENV admin sessions).
 */
export async function authenticateStaff(request, env, db) {
  const cookies = parseCookies(request.headers.get("Cookie"));

  // 1. Try unified GAMMS-AEP-Staff cookie first
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

  // 2. Try Owner ENV / Admin session second
  const adminToken = cookies.get(ADMIN_COOKIE_NAME);
  if (adminToken) {
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
  }

  return { authenticated: false };
}

/**
 * Requires staff authentication AND specific permission for an endpoint handler.
 * Enforces server-side must_change_password blocking.
 */
export async function requirePermission(request, env, db, requiredPermission) {
  const auth = await authenticateStaff(request, env, db);

  if (!auth.authenticated) {
    return {
      authorized: false,
      response: errorJson("STAFF_AUTH_REQUIRED", 401)
    };
  }

  // Enforce server-side must_change_password (Section 20)
  if (auth.session.mustChangePassword === true) {
    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase();
    const isExempt =
      pathname.endsWith("/change-password") ||
      pathname.endsWith("/logout") ||
      pathname.endsWith("/session");

    if (!isExempt) {
      return {
        authorized: false,
        response: errorJson("PASSWORD_CHANGE_REQUIRED", 403)
      };
    }
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
