// GAMMS AEP Staff Password Hashing & Verification (Web Crypto API)
import { sha256Hex } from "./crypto.js";

const DEFAULT_ITERATIONS = 10000;

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Computes PBKDF2-SHA256 hash using Web Crypto API.
 */
export async function hashPasswordPbkdf2(password, saltHex = null, iterations = DEFAULT_ITERATIONS) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password must be a non-empty string");
  }

  let saltBuffer;
  if (saltHex) {
    saltBuffer = hexToBuffer(saltHex);
  } else {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    saltBuffer = saltBytes.buffer;
    saltHex = bufferToHex(saltBytes);
  }

  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: iterations,
      hash: "SHA-256"
    },
    passwordKey,
    256
  );

  const hashHex = bufferToHex(derivedBits);

  return {
    algo: "pbkdf2-sha256",
    hash: hashHex,
    salt: saltHex,
    iterations: iterations
  };
}

/**
 * Convenient wrapper for hashing password into stored string format "pbkdf2:salt:iterations:hash"
 */
export async function hashPassword(password) {
  const res = await hashPasswordPbkdf2(password);
  return `pbkdf2:${res.salt}:${res.iterations}:${res.hash}`;
}

/**
 * Legacy SHA-256 helper
 */
export async function legacySha256Hash(password) {
  return await sha256Hex(password);
}


export function parseStoredHash(stored) {
  if (typeof stored !== "string") return { algo: "unknown" };
  if (stored.startsWith("pbkdf2:")) {
    const parts = stored.split(":");
    return { algo: "pbkdf2-sha256", salt: parts[1], iterations: parseInt(parts[2], 10), hash: parts[3] };
  }
  return { algo: "sha256", hash: stored };
}

/**
 * Verifies a password against a stored hash (supports both legacy SHA-256 and PBKDF2-SHA256).
 */
export async function verifyPassword(password, storedHash, algo = "sha256", salt = null, iterations = DEFAULT_ITERATIONS) {
  if (!password || !storedHash) return false;

  if (storedHash.startsWith("pbkdf2:")) {
    const parsed = parseStoredHash(storedHash);
    const computed = await hashPasswordPbkdf2(password, parsed.salt, parsed.iterations);
    return timingSafeEqualHex(computed.hash.toLowerCase(), parsed.hash.toLowerCase());
  }

  if (algo === "sha256" || !algo) {
    const computed = await sha256Hex(password);
    return timingSafeEqualHex(computed.toLowerCase(), storedHash.toLowerCase());
  }

  if (algo === "pbkdf2-sha256") {
    if (!salt) return false;
    const computed = await hashPasswordPbkdf2(password, salt, iterations || DEFAULT_ITERATIONS);
    return timingSafeEqualHex(computed.hash.toLowerCase(), storedHash.toLowerCase());
  }

  return false;
}
