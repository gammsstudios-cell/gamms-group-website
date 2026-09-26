export const DEFAULT_SECURITY_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'"
};

export function adminJson(data, init = {}) {
  const headers = new Headers(DEFAULT_SECURITY_HEADERS);
  headers.set("content-type", "application/json; charset=utf-8");

  if (init.headers) {
    const setCookies = typeof init.headers.getSetCookie === "function"
      ? init.headers.getSetCookie()
      : [];
    const extra = new Headers(init.headers);
    for (const [key, value] of extra.entries()) {
      if (key.toLowerCase() === "set-cookie" && setCookies.length > 0) continue;
      headers.set(key, value);
    }
    for (const cookie of setCookies) {
      headers.append("set-cookie", cookie);
    }
  }

  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers
  });
}

export function adminError(code, status = 400, details = null, extraHeaders = {}) {
  const payload = { ok: false, code };
  if (details !== null && details !== undefined) {
    payload.details = details;
  }

  return adminJson(payload, { status, headers: extraHeaders });
}

export const jsonResponse = adminJson;
export const errorJson = adminError;


export function adminCsv(csvContent, filename = "export.csv") {
  const headers = new Headers(DEFAULT_SECURITY_HEADERS);
  headers.set("content-type", "text/csv; charset=utf-8");
  headers.set("content-disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

  return new Response(csvContent, {
    status: 200,
    headers
  });
}

export function csvEscape(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Protect against CSV injection in Excel/Sheets if starting with sensitive chars
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function validateCsrf(request) {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { ok: true };
  }

  const contentType = request.headers.get("content-type") ?? "";
  // Ensure requests are application/json
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, code: "CSRF_INVALID_CONTENT_TYPE", status: 415 };
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return { ok: false, code: "CSRF_ORIGIN_MISMATCH", status: 403 };
      }
    } catch {
      return { ok: false, code: "CSRF_ORIGIN_INVALID", status: 403 };
    }
  }

  if (!origin && referer && host) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host !== host) {
        return { ok: false, code: "CSRF_REFERER_MISMATCH", status: 403 };
      }
    } catch {
      return { ok: false, code: "CSRF_REFERER_INVALID", status: 403 };
    }
  }

  return { ok: true };
}
