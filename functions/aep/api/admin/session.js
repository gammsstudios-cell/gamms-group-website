import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminJson } from "../../_lib/adminResponses.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) {
    return adminJson({ authenticated: false, code: auth.code });
  }

  return adminJson({
    authenticated: true,
    user: {
      id: auth.payload.sub,
      role: "admin"
    }
  });
}
