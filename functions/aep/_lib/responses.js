export function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {})
    }
  });
}

export function safeError(code, status = 200, headers) {
  return json({ ok: false, code }, { status, headers });
}

export function errorJson(code, status = 200, headers) {
  return safeError(code, status, headers);
}

