import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { DEFAULT_APP_SECRET, ensureProductionEnv, getAppSecret } from "@/lib/env";

function getSecret() {
  ensureProductionEnv();
  return getAppSecret();
}

function getKey(secret = getSecret()) {
  return createHash("sha256").update(secret).digest();
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, original] = stored.split(":");
  const hash = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(original, "hex"));
}

export function encryptSecret(value: string) {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

function decryptWithSecret(value: string, secret: string) {
  const [ivB64, tagB64, encryptedB64] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", getKey(secret), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function decryptSecret(value?: string) {
  if (!value) return "";
  const currentSecret = getSecret();

  try {
    return decryptWithSecret(value, currentSecret);
  } catch (error) {
    // Backward compatibility for secrets encrypted before APP_SECRET was customized.
    if (currentSecret !== DEFAULT_APP_SECRET) {
      try {
        return decryptWithSecret(value, DEFAULT_APP_SECRET);
      } catch {
        throw error;
      }
    }

    throw error;
  }
}
