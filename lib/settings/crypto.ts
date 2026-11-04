import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
 * AES-256-GCM for settings at rest.
 * Format: "v1:" + base64(iv[12] | authTag[16] | ciphertext).
 * The setting key is bound as additional authenticated data, so a ciphertext
 * cannot be moved to another setting.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Parses SETTINGS_ENCRYPTION_KEY (32 bytes as base64 or 64 hex chars). */
export function parseKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("SETTINGS_ENCRYPTION_KEY ist nicht gesetzt.");
  const trimmed = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY muss genau 32 Byte lang sein (Base64 oder Hex).");
  return key;
}

export function encrypt(plaintext: string, key: Buffer, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

export function decrypt(payload: string, key: Buffer, aad: string): string {
  const [version, body] = payload.split(":", 2);
  if (version !== VERSION || !body) throw new Error("Unbekanntes Format verschlüsselter Einstellungen.");
  const raw = Buffer.from(body, "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Verschlüsselte Einstellung ist beschädigt.");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}

/** Shows only the last four characters, e.g. "••••abcd". */
export function mask(secret: string): string {
  return `••••${secret.slice(-4)}`;
}
