// GAMMS AEP Staff Password Hashing & Verification (Web Crypto API)
import { sha256Hex } from "./crypto.js";

export const PBKDF2_TARGET_ITERATIONS = 600000;
export const MIN_ACCEPTED_ITERATIONS = 1000;
export const MAX_ACCEPTED_ITERATIONS = 1000000;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

const HEX_REGEX = /^[0-9a-fA-F]+$/;
const DIGITS_REGEX = /^\d+$/;

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuffer(hex, expectedByteLength = null) {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !HEX_REGEX.test(hex)) {
    return null;
  }
  if (expectedByteLength !== null && hex.length !== expectedByteLength * 2) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const val = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(val)) return null;
    bytes[i] = val;
  }
  return bytes.buffer;
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function parseIterationCount(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return null;
    return value;
  }
  if (typeof value !== "string" || !DIGITS_REGEX.test(value)) {
    return null;
  }
  const iterations = Number(value);
  return Number.isSafeInteger(iterations) ? iterations : null;
}

export function parseStoredHash(stored) {
  if (typeof stored !== "string" || !stored) {
    return { valid: false, algo: "invalid" };
  }

  if (stored.startsWith("pbkdf2:")) {
    const parts = stored.split(":");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return { valid: false, algo: "invalid" };
    }
    const salt = parts[1];
    const iterations = parseIterationCount(parts[2]);
    const hash = parts[3];

    if (!salt || salt.length !== 32 || !HEX_REGEX.test(salt)) {
      return { valid: false, algo: "invalid" };
    }
    if (!Number.isInteger(iterations) || iterations < MIN_ACCEPTED_ITERATIONS || iterations > MAX_ACCEPTED_ITERATIONS) {
      return { valid: false, algo: "invalid" };
    }
    if (!hash || hash.length !== 64 || !HEX_REGEX.test(hash)) {
      return { valid: false, algo: "invalid" };
    }

    return { valid: true, algo: "pbkdf2-sha256", salt, iterations, hash };
  }

  if (stored.length === 64 && HEX_REGEX.test(stored)) {
    return { valid: true, algo: "sha256", hash: stored };
  }

  return { valid: false, algo: "invalid" };
}

export function needsPasswordRehash(storedHash, algo, iterations) {
  if (typeof storedHash === "string" && storedHash.startsWith("pbkdf2:")) {
    const parsed = parseStoredHash(storedHash);
    if (!parsed.valid) return false;
    return parsed.iterations < PBKDF2_TARGET_ITERATIONS;
  }

  if (algo === "sha256" || !algo) {
    return true;
  }

  if (algo === "pbkdf2-sha256") {
    const iter = parseIterationCount(iterations);
    return !Number.isInteger(iter) || iter < PBKDF2_TARGET_ITERATIONS;
  }

  return false;
}

async function derivePbkdf2(password, saltHex, iterations) {
  if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password length must be between 1 and ${MAX_PASSWORD_LENGTH} characters`);
  }

  const safeIterations = parseIterationCount(iterations);
  if (!Number.isInteger(safeIterations) || safeIterations < MIN_ACCEPTED_ITERATIONS || safeIterations > MAX_ACCEPTED_ITERATIONS) {
    throw new Error(`Iterations must be an integer between ${MIN_ACCEPTED_ITERATIONS} and ${MAX_ACCEPTED_ITERATIONS}`);
  }

  const saltBuffer = hexToBuffer(saltHex, 16);
  if (!saltBuffer) {
    throw new Error("Invalid salt hex string (expected 32 hex chars)");
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
      iterations: safeIterations,
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
    iterations: safeIterations
  };
}

/**
 * Computes PBKDF2-SHA256 hash for creating or changing passwords.
 */
export async function hashPasswordPbkdf2(password, saltHex = null, iterations = PBKDF2_TARGET_ITERATIONS) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`);
  }

  let safeSaltHex = saltHex;
  if (!safeSaltHex) {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    safeSaltHex = bufferToHex(saltBytes);
  }

  return derivePbkdf2(password, safeSaltHex, iterations);
}

export async function hashPassword(password) {
  const res = await hashPasswordPbkdf2(password);
  return `pbkdf2:${res.salt}:${res.iterations}:${res.hash}`;
}

export async function legacySha256Hash(password) {
  return await sha256Hex(password);
}

/**
 * Verifies a password against a stored hash.
 */
export async function verifyPassword(password, storedHash, algo = "sha256", salt = null, iterations = PBKDF2_TARGET_ITERATIONS) {
  if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH || !storedHash) {
    return false;
  }

  if (storedHash.startsWith("pbkdf2:")) {
    const parsed = parseStoredHash(storedHash);
    if (!parsed.valid) return false;
    const computed = await derivePbkdf2(password, parsed.salt, parsed.iterations);
    return timingSafeEqualHex(computed.hash.toLowerCase(), parsed.hash.toLowerCase());
  }

  if (algo === "sha256" || !algo) {
    const parsed = parseStoredHash(storedHash);
    if (!parsed.valid || parsed.algo !== "sha256") return false;
    const computed = await sha256Hex(password);
    return timingSafeEqualHex(computed.toLowerCase(), storedHash.toLowerCase());
  }

  if (algo === "pbkdf2-sha256") {
    if (!salt) return false;
    const iter = parseIterationCount(iterations);
    if (!Number.isInteger(iter) || iter < MIN_ACCEPTED_ITERATIONS || iter > MAX_ACCEPTED_ITERATIONS) {
      return false;
    }
    const computed = await derivePbkdf2(password, salt, iter);
    return timingSafeEqualHex(computed.hash.toLowerCase(), storedHash.toLowerCase());
  }

  return false;
}
