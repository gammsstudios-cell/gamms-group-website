// GAMMS AEP MFA TOTP (RFC 6238) & Recovery Codes Implementation (Web Crypto API)

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
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

function base32Decode(base32Str) {
  const clean = base32Str.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  const bytes = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
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
 * Generates a secret key for AES-GCM encryption from an environment secret or fallback key.
 */
async function getEncryptionKey(keyString = "GAMMS-AEP-DEFAULT-MFA-SECRET-KEY-32B") {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString.padEnd(32, "0").substring(0, 32));
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts secret string with AES-GCM.
 */
export async function encryptTotpSecret(secret, encryptionKeyStr) {
  const key = await getEncryptionKey(encryptionKeyStr);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(secret)
  );

  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, "0")).join("");
  const bodyHex = Array.from(new Uint8Array(encrypted)).map((b) => b.toString(16).padStart(2, "0")).join("");

  return `${ivHex}:${bodyHex}`;
}

export const encryptSecret = encryptTotpSecret;

/**
 * Decrypts secret string with AES-GCM.
 */
export async function decryptTotpSecret(encryptedStr, encryptionKeyStr) {
  if (!encryptedStr || !encryptedStr.includes(":")) return null;
  const [ivHex, bodyHex] = encryptedStr.split(":");
  const iv = new Uint8Array(Math.ceil(ivHex.length / 2));
  for (let i = 0; i < iv.length; i++) iv[i] = parseInt(ivHex.substring(i * 2, i * 2 + 2), 16);

  const body = new Uint8Array(Math.ceil(bodyHex.length / 2));
  for (let i = 0; i < body.length; i++) body[i] = parseInt(bodyHex.substring(i * 2, i * 2 + 2), 16);

  const key = await getEncryptionKey(encryptionKeyStr);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      body
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    return null;
  }
}

export const decryptSecret = decryptTotpSecret;

/**
 * Generates a new 160-bit TOTP secret.
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
  const label = encodeURIComponent(`GAMMS AEP:${username}`);
  const issuer = encodeURIComponent("By GAMMS GROUP");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Calculates a 6-digit TOTP code for a given secret and counter step.
 */
export async function generateTotpCode(secret, timeStep = Math.floor(Date.now() / 1000 / 30)) {
  const stepIndex = timeStep > 10000000 ? Math.floor(timeStep / 30) : timeStep;
  const keyBytes = base32Decode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setBigUint64(0, BigInt(stepIndex), false);


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

export async function verifyTotpCode(secret, userCode, windowTolerance = 1, customTimestampSec = null) {
  if (typeof userCode !== "string" || userCode.trim().length !== 6) {
    return false;
  }
  const cleanCode = userCode.trim();
  const timeSec = customTimestampSec !== null ? customTimestampSec : Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(timeSec / 30);

  for (let window = -windowTolerance; window <= windowTolerance; window++) {
    const validCode = await generateTotpCode(secret, currentStep + window);
    if (validCode === cleanCode) {
      return true;
    }
  }

  return false;
}


/**
 * Generates 8 random single-use recovery codes.
 */
export async function generateRecoveryCodes() {
  const plainCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < 8; i++) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    plainCodes.push(code);

    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    hashedCodes.push({ hash: hashHex, used: false });
  }

  return { plainCodes, hashedCodes };
}

/**
 * Validates and marks a recovery code as used.
 */
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

  const clean = inputCode.trim().toUpperCase();
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clean));
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

  let matchedIndex = -1;
  for (let i = 0; i < codes.length; i++) {
    if (codes[i].hash === hashHex && !codes[i].used) {
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
