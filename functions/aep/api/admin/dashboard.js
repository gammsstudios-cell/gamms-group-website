import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminError, adminJson } from "../../_lib/adminResponses.js";
import { getDashboardStats } from "../../_lib/dashboard.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  try {
    const stats = await getDashboardStats(context.env.DB);
    return adminJson({ ok: true, stats });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}
