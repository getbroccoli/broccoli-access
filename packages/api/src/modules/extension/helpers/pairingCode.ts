import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { SecretBox } from "../../../core/secrets";

/** What a pairing code carries, sealed with the instance's key so nobody else can read or make one. */
export interface PairingCode {
  /** The user who started pairing, whom the extension redeeming the code pairs for. */
  userId: string;
  /** Tells codes apart, so each is redeemed once. */
  nonce: string;
  /** Epoch milliseconds from which the code is refused. */
  expiresAt: number;
}

/** A one-time code pairing `userId`'s Chrome, valid `PAIRING_CODE_LIFETIME_MS` from `now`. */
export function sealPairingCode(secretBox: SecretBox, userId: string, now: Date): string {
  const code: PairingCode = {
    userId,
    nonce: randomBytes(NONCE_BYTES).toString("base64url"),
    expiresAt: now.getTime() + PAIRING_CODE_LIFETIME_MS,
  };
  return secretBox.encrypt(JSON.stringify(code), ASSOCIATED_DATA);
}

/** The code `sealed` carries while unexpired at `now`; null when it was changed, forged or expired. */
export function openPairingCode(
  secretBox: SecretBox,
  sealed: string,
  now: Date,
): PairingCode | null {
  let plaintext: string;
  try {
    plaintext = secretBox.decrypt(sealed, ASSOCIATED_DATA);
  } catch {
    return null;
  }
  const code = PAIRING_CODE.parse(JSON.parse(plaintext));
  return code.expiresAt > now.getTime() ? code : null;
}

/** How long the owner has between "Pair this Chrome" and Pair in the extension: five minutes. */
const PAIRING_CODE_LIFETIME_MS = 5 * 60_000;

/** 128 random bits: unique among the codes of five minutes. */
const NONCE_BYTES = 16;

/** Keeps any other ciphertext the instance makes, such as a consent state, from passing as a code. */
const ASSOCIATED_DATA = "extension-pairing-code";

const PAIRING_CODE = z.object({ userId: z.string(), nonce: z.string(), expiresAt: z.number() });
