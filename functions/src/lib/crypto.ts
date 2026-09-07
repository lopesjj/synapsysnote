import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";


function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set for the functions runtime");
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1") throw new Error(`Unsupported token envelope: ${version}`);
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8"
  );
}
