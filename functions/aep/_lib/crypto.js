const TOKEN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DEFAULT_TOKEN_LENGTH = 12;
const MIN_TOKEN_LENGTH = 12;
const MAX_TOKEN_LENGTH = 64;

export function normalizeToken(token) {
  return String(token ?? "").trim();
}

export function isValidTokenFormat(token) {
  const value = normalizeToken(token);
  if (value.length < MIN_TOKEN_LENGTH || value.length > MAX_TOKEN_LENGTH) {
    return false;
  }

  return /^[0-9A-Za-z]+$/.test(value);
}

// Adapted from Quoda's MIT-licensed genShortCode(): base62 token generation
// with crypto.getRandomValues and rejection sampling to avoid modulo bias.
// Attribution: Quoda, Copyright (c) 2026 Can Erdogan, MIT License.
export function generateQrToken(length = DEFAULT_TOKEN_LENGTH) {
  if (!Number.isInteger(length) || length < MIN_TOKEN_LENGTH || length > MAX_TOKEN_LENGTH) {
    throw new RangeError(`Token length must be an integer between ${MIN_TOKEN_LENGTH} and ${MAX_TOKEN_LENGTH}.`);
  }

  const output = [];
  const max = Math.floor(256 / TOKEN_ALPHABET.length) * TOKEN_ALPHABET.length;

  while (output.length < length) {
    const bytes = new Uint8Array(length - output.length);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= max) continue;
      output.push(TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]);
      if (output.length === length) break;
    }
  }

  return output.join("");
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashQrToken(token) {
  const value = normalizeToken(token);
  if (!isValidTokenFormat(value)) {
    throw new TypeError("Invalid QR token format.");
  }

  return sha256Hex(value);
}
