// GAMMS AEP MFA TOTP (RFC 6238) & Recovery Codes Implementation (Web Crypto API)
import { hexToBuffer, timingSafeEqualHex } from "./passwords.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_REGEX = /^[A-Z2-7]+=*$/i;
const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;
const OTP_REGEX = /^\d{6}$/;
const AAD_BYTES = new TextEncoder().encode("GAMMS-AEP-TOTP-v1");

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualString(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export function base32Encode(buffer) {
  const bytes = new Uint8Array(buffer);
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(base32Str) {
  if (typeof base32Str !== "string") {
    return null;
  }

  const clean = base32Str.toUpperCase().replace(/\s+/g, "");
  if (!clean || !BASE32_REGEX.test(clean)) {
    return null;
  }

  const unpadded = clean.replace(/=+$/, "");
  const bytes = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < unpadded.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(unpadded[i]);
    if (idx === -1) {
      return null;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Validates and imports the 64-hex char AES-256-GCM encryption key.
 * FAILS CLOSED if key is missing or invalid (no default fallback).
 */
async function getEncryptionKey(keyString) {
  if (typeof keyString !== "string" || !HEX_64_REGEX.test(keyString.trim())) {
    throw new Error("MFA_ENCRYPTION_KEY_NOT_CONFIGURED");
  }

  const keyBuffer = hexToBuffer(keyString.trim(), 32);
  if (!keyBuffer) {
    throw new Error("MFA_ENCRYPTION_KEY_NOT_CONFIGURED");
  }

  return crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts secret string with AES-GCM (Format: v1:<ivHex>:<ciphertextHex>).
 */
export async function encryptTotpSecret(secret, encryptionKeyStr) {
  const key = await getEncryptionKey(encryptionKeyStr);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD_BYTES },
    key,
    encoder.encode(secret)
  );

  const ivHex = bufferToHex(iv);
  const bodyHex = bufferToHex(encrypted);

  return `v1:${ivHex}:${bodyHex}`;
}

export const encryptSecret = encryptTotpSecret;

/**
 * Decrypts versioned secret string with AES-GCM.
 */
export async function decryptTotpSecret(encryptedStr, encryptionKeyStr) {
  if (typeof encryptedStr !== "string" || !encryptedStr.startsWith("v1:")) {
    // Support migration from legacy iv:body without version prefix if valid
    if (typeof encryptedStr === "string" && encryptedStr.includes(":") && !encryptedStr.startsWith("v1:")) {
      const parts = encryptedStr.split(":");
      if (parts.length === 2 && parts[0].length === 24 && parts[1].length > 0) {
        try {
          const legacyKey = await getEncryptionKey(encryptionKeyStr);
          const ivBuf = hexToBuffer(parts[0], 12);
          const bodyBuf = hexToBuffer(parts[1]);
          if (!ivBuf || !bodyBuf) return null;
          const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, legacyKey, bodyBuf);
          return new TextDecoder().decode(dec);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  const parts = encryptedStr.split(":");
  if (parts.length !== 3 || parts[0] !== "v1" || parts[1].length !== 24) {
    return null;
  }

  const ivBuf = hexToBuffer(parts[1], 12);
  const bodyBuf = hexToBuffer(parts[2]);
  if (!ivBuf || !bodyBuf) return null;

  try {
    const key = await getEncryptionKey(encryptionKeyStr);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuf, additionalData: AAD_BYTES },
      key,
      bodyBuf
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export const decryptSecret = decryptTotpSecret;

/**
 * Generates a new 160-bit (20 random bytes) TOTP secret.
 */
export function generateTotpSecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/**
 * Formats an otpauth URI for QR generation.
 */
export function getTotpUri(username, secret) {
  const issuer = "GAMMS AEP by GAMMS GROUP";
  const label = `${issuer}:${username}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Calculates a 6-digit TOTP code for a given secret and explicit counter step.
 */
export async function generateTotpCodeForCounter(secret, counterStep) {
  const keyBytes = base32Decode(secret);
  if (!keyBytes) {
    throw new Error("TOTP_SECRET_INVALID");
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setBigUint64(0, BigInt(counterStep), false);

  const hmac = await crypto.subtle.sign("HMAC", cryptoKey, counterBuffer);
  const hmacBytes = new Uint8Array(hmac);

  const offset = hmacBytes[hmacBytes.length - 1] & 0xf;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/**
 * Calculates a 6-digit TOTP code for a given secret and timestamp (seconds).
 */
export async function generateTotpCode(secret, timestampSec = Math.floor(Date.now() / 1000)) {
  const safeTimestampSec = Number.parseInt(timestampSec, 10);
  if (!Number.isInteger(safeTimestampSec) || safeTimestampSec < 0) {
    throw new Error("TOTP_TIMESTAMP_INVALID");
  }
  const counterStep = Math.floor(safeTimestampSec / 30);
  return generateTotpCodeForCounter(secret, counterStep);
}

/**
 * Verifies a 6-digit TOTP code against a secret within window tolerance.
 */
export async function verifyTotpCode(secret, userCode, windowTolerance = 1, customTimestampSec = null) {
  if (typeof userCode !== "string" || !OTP_REGEX.test(userCode.trim())) {
    return { valid: false, matchedStep: null };
  }

  const cleanCode = userCode.trim();
  const timeSec = customTimestampSec !== null ? customTimestampSec : Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(timeSec / 30);

  for (let window = -windowTolerance; window <= windowTolerance; window++) {
    const step = currentStep + window;
    if (step < 0) continue;
    const validCode = await generateTotpCodeForCounter(secret, step);
    if (timingSafeEqualString(validCode, cleanCode)) {
      return { valid: true, matchedStep: step };
    }
  }

  return { valid: false, matchedStep: null };
}

/**
 * Verifies a TOTP code with RFC 6238 atomic replay protection.
 */
export async function verifyTotpCodeWithReplay(db, principalRef, secret, userCode, windowTolerance = 1, customTimestampSec = null) {
  const result = await verifyTotpCode(secret, userCode, windowTolerance, customTimestampSec);
  if (!result.valid || result.matchedStep === null) {
    return { valid: false, code: "MFA_INVALID" };
  }

  if (!db || typeof principalRef !== "string" || principalRef.trim().length === 0) {
    return { valid: false, code: "MFA_REPLAY_STATE_UNAVAILABLE" };
  }

  try {
    const updateResult = await db.prepare(`
      INSERT INTO auth_totp_replay_state (principal_ref, last_used_step, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(principal_ref) DO UPDATE SET
        last_used_step = excluded.last_used_step,
        updated_at = CURRENT_TIMESTAMP
      WHERE excluded.last_used_step > auth_totp_replay_state.last_used_step
    `).bind(principalRef, result.matchedStep).run();

    const changes = Number(updateResult?.meta?.changes ?? 0);
    if (changes !== 1) {
      return { valid: false, code: "MFA_REPLAYED", error: "El código OTP ya ha sido utilizado previamente" };
    }

    return { valid: true, matchedStep: result.matchedStep };
  } catch (error) {
    return { valid: false, code: "MFA_REPLAY_STATE_UNAVAILABLE", error: "Error de validación contra reutilización OTP" };
  }
}

/**
 * Generates 8 single-use recovery codes with 80-bit entropy (10 random bytes each).
 */
export async function generateRecoveryCodes() {
  const plainCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < 8; i++) {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    const hex = bufferToHex(bytes).toUpperCase();
    const formatted = `${hex.slice(0, 5)}-${hex.slice(5, 10)}-${hex.slice(10, 15)}-${hex.slice(15, 20)}`;
    plainCodes.push(formatted);

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(formatted));
    const hashHex = bufferToHex(hashBuffer);
    hashedCodes.push({ hash: hashHex, used: false });
  }

  return { plainCodes, hashedCodes };
}

/**
 * Validates and atomically consumes a recovery code for a staff user.
 */
export async function consumeRecoveryCodeAtomic(db, userId, inputCode) {
  if (!db || !userId || typeof inputCode !== "string" || !inputCode.trim()) {
    return { valid: false };
  }

  const user = await db.prepare("SELECT recovery_codes_json FROM aep_users WHERE id = ?").bind(userId).first();
  if (!user || !user.recovery_codes_json) {
    return { valid: false };
  }

  const clean = inputCode.trim().toUpperCase();
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(clean));
  const hashHex = bufferToHex(hashBuffer);

  let codes;
  try {
    codes = typeof user.recovery_codes_json === "string" ? JSON.parse(user.recovery_codes_json) : user.recovery_codes_json;
  } catch {
    return { valid: false };
  }

  if (!Array.isArray(codes)) return { valid: false };

  let matchedIndex = -1;
  for (let i = 0; i < codes.length; i++) {
    if (timingSafeEqualHex(codes[i].hash, hashHex) && !codes[i].used) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    return { valid: false };
  }

  const updatedCodes = codes.map((c, idx) => idx === matchedIndex ? { ...c, used: true } : c);
  const updatedJson = JSON.stringify(updatedCodes);

  // Optimistic concurrency atomic update
  const updateResult = await db.prepare(`
    UPDATE aep_users
    SET recovery_codes_json = ?
    WHERE id = ? AND recovery_codes_json = ?
  `).bind(updatedJson, userId, user.recovery_codes_json).run();

  const changes = Number(updateResult?.meta?.changes ?? 0);
  if (changes !== 1) {
    return { valid: false, code: "RECOVERY_CODE_ALREADY_USED" };
  }

  return { valid: true };
}

export async function consumeRecoveryCode(recoveryCodesJson, inputCode) {
  if (!recoveryCodesJson || typeof inputCode !== "string") {
    return { valid: false };
  }
  let codes;
  try {
    codes = typeof recoveryCodesJson === "string" ? JSON.parse(recoveryCodesJson) : recoveryCodesJson;
  } catch {
    return { valid: false };
  }

  if (!Array.isArray(codes)) return { valid: false };

  const clean = inputCode.trim().toUpperCase();
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(clean));
  const hashHex = bufferToHex(hashBuffer);

  let matchedIndex = -1;
  for (let i = 0; i < codes.length; i++) {
    if (timingSafeEqualHex(codes[i].hash, hashHex) && !codes[i].used) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    return { valid: false };
  }

  codes[matchedIndex].used = true;
  return { valid: true, updatedCodesJson: JSON.stringify(codes) };
}
