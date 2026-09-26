import { generateQrToken } from "./crypto.js";

export const CUSTOMER_COOKIE_NAME = "GAMMS-AEP-Customer";
const CUSTOMER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseCookies(cookieHeader = "") {
  const cookies = new Map();

  for (const part of String(cookieHeader).split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;

    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

export function generateCustomerId() {
  return `cust_${generateQrToken(32)}`;
}

export function getCustomerIdFromRequest(request) {
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const customerId = cookies.get(CUSTOMER_COOKIE_NAME);

  return typeof customerId === "string" && customerId.startsWith("cust_")
    ? customerId
    : null;
}

export function buildCustomerCookie(customerId, request) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";

  return [
    `${CUSTOMER_COOKIE_NAME}=${encodeURIComponent(customerId)}`,
    "Path=/aep",
    `Max-Age=${CUSTOMER_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax"
  ].join("; ") + secure;
}
