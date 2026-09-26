import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEqualHex,
  constantTimeEqualString,
  hmacSha256Base64Url,
  sha256Hex
} from "./crypto.js";
import { parseCookies } from "./cookies.js";

export const SELLER_COOKIE_NAME = "GAMMS-AEP-Seller";
const SELLER_SESSION_MAX_AGE = 60 * 60 * 8;
const SELLER_SESSION_VERSION = 1;

function hasSellerSecrets(env) {
  return Boolean(env?.AEP_SELLER_PASSCODE_HASH && env?.AEP_SELLER_SESSION_SECRET);
}

export function buildSellerCookie(value, request, maxAge = SELLER_SESSION_MAX_AGE) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return [
    `${SELLER_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/aep",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict"
  ].join("; ") + secure;
}

export function clearSellerCookie(request) {
  return buildSellerCookie("", request, 0);
}

export async function createSellerSession(env, now = Date.now()) {
  const payload = {
    seller: true,
    exp: now + SELLER_SESSION_MAX_AGE * 1000,
    version: SELLER_SESSION_VERSION
  };
  const payloadValue = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256Base64Url(env.AEP_SELLER_SESSION_SECRET, payloadValue);

  return `${payloadValue}.${signature}`;
}

export async function verifySellerSession(env, value, now = Date.now()) {
  if (!hasSellerSecrets(env)) return { ok: false, code: "SELLER_AUTH_NOT_CONFIGURED", status: 503 };
  const [payloadValue, signature] = String(value ?? "").split(".");
  if (!payloadValue || !signature) return { ok: false, code: "SELLER_AUTH_REQUIRED", status: 401 };

  const expected = await hmacSha256Base64Url(env.AEP_SELLER_SESSION_SECRET, payloadValue);
  if (!constantTimeEqualString(expected, signature)) {
    return { ok: false, code: "SELLER_AUTH_REQUIRED", status: 401 };
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadValue)));
  } catch {
    return { ok: false, code: "SELLER_AUTH_REQUIRED", status: 401 };
  }

  if (payload.version !== SELLER_SESSION_VERSION || payload.seller !== true || payload.exp <= now) {
    return { ok: false, code: "SELLER_AUTH_REQUIRED", status: 401 };
  }

  return { ok: true, payload };
}

export async function loginSeller(env, passcode) {
  if (!hasSellerSecrets(env)) return { ok: false, code: "SELLER_AUTH_NOT_CONFIGURED", status: 503 };
  const hash = await sha256Hex(String(passcode ?? ""));

  if (!constantTimeEqualHex(hash, env.AEP_SELLER_PASSCODE_HASH)) {
    return { ok: false, code: "SELLER_AUTH_INVALID", status: 401 };
  }

  return { ok: true };
}

export async function requireSellerAuth(request, env) {
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  return verifySellerSession(env, cookies.get(SELLER_COOKIE_NAME));
}
