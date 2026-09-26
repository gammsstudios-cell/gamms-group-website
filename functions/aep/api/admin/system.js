import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminError, adminJson } from "../../_lib/adminResponses.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  let d1Status = "connected";
  let knownTables = [];

  try {
    const tableResult = await context.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    knownTables = (tableResult?.results ?? []).map((t) => t.name);
  } catch {
    d1Status = "error";
  }

  const utcNow = new Date().toISOString();

  return adminJson({
    ok: true,
    system: {
      appName: "GAMMS AEP Control Center",
      version: "1.0.0",
      status: "operational",
      d1Connectivity: d1Status,
      knownTables,
      environment: context.env.CF_PAGES_BRANCH || "development",
      utcTime: utcNow,
      eventTimezone: "America/Managua"
    }
  });
}
