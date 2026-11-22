import { z } from "zod";

import type { SecretBox } from "../../../core/secrets";

/**
 * What the OAuth `state` carries from the start of a consent to Google's answer, encrypted: the
 * client credentials, which are stored only once the consent succeeds, and the ID token's nonce.
 * It is encrypted for the setup token of the browser that started it, so only that browser redeems it.
 */
export interface ConsentState {
  /** What the consent is for; Google sign-in will add its own. */
  flow: "connect_google_workspace";
  clientId: string;
  clientSecret: string;
  nonce: string;
  /** Epoch milliseconds after which Google's answer is refused. */
  expiresAt: number;
}

/** `state` encrypted for the `state` parameter, for the browser holding `setupToken`. */
export function sealConsentState(
  secretBox: SecretBox,
  state: ConsentState,
  setupToken: string,
): string {
  return secretBox.encrypt(JSON.stringify(state), associatedData(setupToken));
}

/**
 * The state of `sealed` while it is unexpired at `now`; null when it was changed, forged, expired
 * or started by a browser holding another setup token.
 */
export function openConsentState(
  secretBox: SecretBox,
  sealed: string,
  { setupToken, now }: { setupToken: string; now: Date },
): ConsentState | null {
  let plaintext: string;
  try {
    plaintext = secretBox.decrypt(sealed, associatedData(setupToken));
  } catch {
    return null;
  }
  const state = CONSENT_STATE.parse(JSON.parse(plaintext));
  return state.expiresAt > now.getTime() ? state : null;
}

/** Binds a state to its browser, and keeps any other ciphertext the instance makes from passing as one. */
function associatedData(setupToken: string): string {
  return `google-consent-state:${setupToken}`;
}

const CONSENT_STATE = z.object({
  flow: z.literal("connect_google_workspace"),
  clientId: z.string(),
  clientSecret: z.string(),
  nonce: z.string(),
  expiresAt: z.number(),
});
