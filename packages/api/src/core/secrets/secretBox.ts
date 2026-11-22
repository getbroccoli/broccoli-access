import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypts credentials that the database stores, such as a Resend key. `associatedData`, such as
 * the row's id, binds a ciphertext to its place, so one copied elsewhere does not decrypt.
 */
export interface SecretBox {
  /** `plaintext` encrypted and authenticated, as base64url. */
  encrypt(plaintext: string, associatedData?: string): string;
  /**
   * The plaintext of `encrypt`; throws when `encrypted` was changed, encrypted with another key or
   * with other associated data.
   */
  decrypt(encrypted: string, associatedData?: string): string;
}

/** SecretBox with `key`, a base64url secret of 32 bytes such as `ensureSecret` makes. */
export function createSecretBox(key: string): SecretBox {
  const keyBytes = Buffer.from(key, "base64url");
  if (keyBytes.length !== KEY_BYTES) {
    throw new Error(`The encryption key must be ${KEY_BYTES} bytes`);
  }
  return {
    encrypt: (plaintext, associatedData = "") => {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keyBytes, iv);
      cipher.setAAD(Buffer.from(associatedData, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
    },
    decrypt: (encrypted, associatedData = "") => {
      const bytes = Buffer.from(encrypted, "base64url");
      const decipher = createDecipheriv(ALGORITHM, keyBytes, bytes.subarray(0, IV_BYTES));
      decipher.setAAD(Buffer.from(associatedData, "utf8"));
      decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([
        decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
