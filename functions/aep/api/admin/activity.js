import { requireAdminAuth } from "../../_lib/adminAuth.js";
import { adminCsv, adminError, adminJson, csvEscape } from "../../_lib/adminResponses.js";
import { getAuditEvents } from "../../_lib/audit.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAuth(context.request, context.env);
  if (!auth.ok) return adminError(auth.code, auth.status);

  const url = new URL(context.request.url);
  const format = url.searchParams.get("format");
  const actorType = url.searchParams.get("actor_type");
  const action = url.searchParams.get("action");
  const page = url.searchParams.get("page") ?? 1;
  const limit = url.searchParams.get("limit") ?? 50;

  try {
    const result = await getAuditEvents(context.env.DB, { actorType, action, page, limit });

    if (format === "csv") {
      const headers = ["ID", "Fecha/Hora", "Actor", "Acción", "Entidad", "ID Entidad", "Metadata"];
      const rows = result.items.map((a) => [
        a.id,
        a.createdAt,
        `${a.actorType}:${a.actorIdentifier}`,
        a.action,
        a.entityType,
        a.entityIdentifier ?? "",
        a.metadata ? JSON.stringify(a.metadata) : ""
      ]);
      const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
      return adminCsv(csv, "auditoria_actividad.csv");
    }

    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminError("INTERNAL_ERROR", 500, error.message);
  }
}
