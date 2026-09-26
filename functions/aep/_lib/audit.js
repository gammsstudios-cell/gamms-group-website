export async function logAuditEvent(
  db,
  { actorType = "admin", actorIdentifier = "admin", action, entityType, entityIdentifier = null, metadata = null }
) {
  if (!db || !action || !entityType) return;

  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  try {
    await db
      .prepare(
        `INSERT INTO audit_events (actor_type, actor_identifier, action, entity_type, entity_identifier, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(actorType, actorIdentifier, action, entityType, entityIdentifier, metadataJson)
      .run();
  } catch (error) {
    // Audit logging failure should not break main request if table does not exist in dev/tests, but print warning
    console.error("Failed to log audit event:", error?.message);
  }
}

export async function getAuditEvents(db, { actorType = null, action = null, page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  if (actorType) {
    conditions.push("actor_type = ?");
    params.push(actorType);
  }

  if (action) {
    conditions.push("action LIKE ?");
    params.push(`%${action}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db
    .prepare(`SELECT COUNT(*) AS total FROM audit_events ${whereClause}`)
    .bind(...params)
    .first();

  const total = countResult?.total ?? 0;

  const eventsResult = await db
    .prepare(
      `SELECT id, actor_type, actor_identifier, action, entity_type, entity_identifier, metadata_json, created_at
       FROM audit_events
       ${whereClause}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, safeLimit, offset)
    .all();

  const items = (eventsResult?.results ?? []).map((row) => {
    let metadata = null;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json);
      } catch {
        metadata = row.metadata_json;
      }
    }
    return {
      id: row.id,
      actorType: row.actor_type,
      actorIdentifier: row.actor_identifier,
      action: row.action,
      entityType: row.entity_type,
      entityIdentifier: row.entity_identifier,
      metadata,
      createdAt: row.created_at
    };
  });

  return {
    items,
    pagination: {
      page: safePage,
      pageSize: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
}
