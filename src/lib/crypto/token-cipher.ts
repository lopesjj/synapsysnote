import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for third-party OAuth tokens.
 *
 * Format: `v1.<iv-b64>.<tag-b64>.<ciphertext-b64>` — versioned so the key can be
 * rotated later without guessing the layout. The key comes from
 * `TOKEN_ENCRYPTION_KEY` (32-byte base64 or any passphrase, hashed to 32 bytes).
 */

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is missing. Generate one with: openssl rand -base64 32"
    );
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  // Any other input is stretched deterministically to 32 bytes.
  return createHash("sha256").update(raw).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptToken(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1") throw new Error(`Unsupported token envelope: ${version}`);
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Safe-to-display fingerprint, e.g. `secret_••••4f2a`. */
export function tokenPreview(token: string): string {
  return `${token.slice(0, 7)}••••${token.slice(-4)}`;
}
