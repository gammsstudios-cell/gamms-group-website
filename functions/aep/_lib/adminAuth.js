import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEqualHex,
  constantTimeEqualString,
  hmacSha256Base64Url,
  sha256Hex
} from "./crypto.js";
import { parseCookies } from "./cookies.js";

export const ADMIN_COOKIE_NAME = "GAMMS-AEP-Admin";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours
const ADMIN_SESSION_VERSION = 1;

export function hasAdminSecrets(env) {
  return Boolean(env?.AEP_ADMIN_PASSCODE_HASH && env?.AEP_ADMIN_SESSION_SECRET);
}

export function buildAdminCookie(value, request, maxAge = ADMIN_SESSION_MAX_AGE) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/aep",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict"
  ].join("; ") + secure;
}

export function clearAdminCookie(request) {
  return buildAdminCookie("", request, 0);
}

export async function createAdminSession(env, adminId = "admin", now = Date.now()) {
  if (!hasAdminSecrets(env)) {
    throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  }

  const payload = {
    admin: true,
    sub: adminId,
    exp: now + ADMIN_SESSION_MAX_AGE * 1000,
    version: ADMIN_SESSION_VERSION
  };
  const payloadValue = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256Base64Url(env.AEP_ADMIN_SESSION_SECRET, payloadValue);

  return `${payloadValue}.${signature}`;
}

export async function verifyAdminSession(env, value, now = Date.now()) {
  if (!hasAdminSecrets(env)) {
    return { ok: false, code: "ADMIN_AUTH_NOT_CONFIGURED", status: 503 };
  }

  const [payloadValue, signature] = String(value ?? "").split(".");
  if (!payloadValue || !signature) {
    return { ok: false, code: "ADMIN_AUTH_REQUIRED", status: 401 };
  }

  const expected = await hmacSha256Base64Url(env.AEP_ADMIN_SESSION_SECRET, payloadValue);
  if (!constantTimeEqualString(expected, signature)) {
    return { ok: false, code: "ADMIN_AUTH_REQUIRED", status: 401 };
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadValue)));
  } catch {
    return { ok: false, code: "ADMIN_AUTH_REQUIRED", status: 401 };
  }

  if (
    payload.version !== ADMIN_SESSION_VERSION ||
    payload.admin !== true ||
    payload.exp <= now
  ) {
    return { ok: false, code: "ADMIN_AUTH_REQUIRED", status: 401 };
  }

  return { ok: true, payload };
}

export async function loginAdmin(env, passcode) {
  if (!hasAdminSecrets(env)) {
    return { ok: false, code: "ADMIN_AUTH_NOT_CONFIGURED", status: 503 };
  }

  const hash = await sha256Hex(String(passcode ?? ""));

  if (!constantTimeEqualHex(hash, env.AEP_ADMIN_PASSCODE_HASH)) {
    return { ok: false, code: "ADMIN_AUTH_INVALID", status: 401 };
  }

  return { ok: true };
}

export async function requireAdminAuth(request, env) {
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const adminCookie = cookies.get(ADMIN_COOKIE_NAME);

  if (!adminCookie) {
    return { ok: false, code: "ADMIN_AUTH_REQUIRED", status: 401 };
  }

  return verifyAdminSession(env, adminCookie);
}
