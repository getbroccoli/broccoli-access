import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * The token a paired extension sends: `<pairing id>.<secret>`. The id finds the row; only the
 * secret's hash is stored, and it is compared in constant time.
 */
export interface PairingToken {
  pairingId: string;
  secret: string;
}

/** A new random secret for a token. */
export function newTokenSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

/** The stored form of a token's secret, such as `sha256:3f…`. */
export function hashTokenSecret(secret: string): string {
  return `${HASH_PREFIX}${digest(secret).toString("hex")}`;
}

/** The token the extension receives once, for its pairing and secret. */
export function formatPairingToken({ pairingId, secret }: PairingToken): string {
  return `${pairingId}${SEPARATOR}${secret}`;
}

/** The parts of `token`; null for anything that is not a pairing id and a secret. */
export function parsePairingToken(token: string): PairingToken | null {
  const separator = token.indexOf(SEPARATOR);
  const pairingId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  const isWellFormed = separator > 0 && secret !== "" && z.uuid().safeParse(pairingId).success;
  return isWellFormed ? { pairingId, secret } : null;
}

/** Whether `secret` is the one `tokenHash` was made from, in time that does not depend on where they differ. */
export function secretMatches(secret: string, tokenHash: string): boolean {
  const stored = Buffer.from(tokenHash.slice(HASH_PREFIX.length), "hex");
  const given = digest(secret);
  return stored.length === given.length && timingSafeEqual(stored, given);
}

/** 256 random bits, beyond guessing. */
const SECRET_BYTES = 32;

const HASH_PREFIX = "sha256:";

/** Never part of a UUID, so the first one ends the pairing id. */
const SEPARATOR = ".";

function digest(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}
