import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { SecretBox } from "../../../core/secrets";

/**
 * What the OAuth `state` carries from the start of a consent to Google's answer, encrypted for the
 * browser that started it, so only that browser redeems it: what the consent is for and the ID
 * token's nonce.
 */
export type ConsentState = WorkspaceConsentState | SignInState | GoogleAppChangeState;

/** Setup's consent, carrying the client credentials, which are stored only once it succeeds. */
export interface WorkspaceConsentState {
  flow: "connect_google_workspace";
  clientId: string;
  clientSecret: string;
  nonce: string;
  /** Epoch milliseconds after which Google's answer is refused. */
  expiresAt: number;
}

/**
 * The owner changing the connection's Google app, carrying the new client credentials, which
 * replace the old ones only once the consent succeeds.
 */
export interface GoogleAppChangeState {
  flow: "change_google_app";
  clientId: string;
  clientSecret: string;
  nonce: string;
  /** Epoch milliseconds after which Google's answer is refused. */
  expiresAt: number;
}

/** A sign-in, with the Google Workspace connection's client, read again when Google answers. */
export interface SignInState {
  flow: "sign_in_with_google";
  nonce: string;
  /** Epoch milliseconds after which Google's answer is refused. */
  expiresAt: number;
}

/** How long a person has between starting a consent and Google's answer: ten minutes. */
export const CONSENT_LIFETIME_MS = 10 * 60_000;

/**
 * `state`, valid `CONSENT_LIFETIME_MS` from `now`, encrypted for the `state` parameter of the browser
 * holding `browserToken`. Its flow stays readable, though authenticated, so Google's one callback
 * can dispatch it.
 */
export function sealConsentState(
  secretBox: SecretBox,
  state:
    | Omit<WorkspaceConsentState, "expiresAt">
    | Omit<SignInState, "expiresAt">
    | Omit<GoogleAppChangeState, "expiresAt">,
  { browserToken, now }: { browserToken: string; now: Date },
): string {
  const expiresAt = now.getTime() + CONSENT_LIFETIME_MS;
  const sealed = secretBox.encrypt(
    JSON.stringify({ ...state, expiresAt }),
    associatedData(state.flow, browserToken),
  );
  return `${state.flow}${FLOW_SEPARATOR}${sealed}`;
}

/** The flow `sealed` says it is for, unverified: only to choose the use case that opens it. */
export function consentFlowOf(sealed: string): string {
  return sealed.slice(0, Math.max(sealed.indexOf(FLOW_SEPARATOR), 0));
}

/**
 * The state of `sealed` while it is unexpired at `now`; null when it was changed, forged, expired
 * or started by a browser holding another token.
 */
export function openConsentState(
  secretBox: SecretBox,
  sealed: string,
  { browserToken, now }: { browserToken: string; now: Date },
): ConsentState | null {
  const flow = consentFlowOf(sealed);
  let plaintext: string;
  try {
    const encrypted = sealed.slice(flow.length + FLOW_SEPARATOR.length);
    plaintext = secretBox.decrypt(encrypted, associatedData(flow, browserToken));
  } catch {
    return null;
  }
  const state = CONSENT_STATE.parse(JSON.parse(plaintext));
  return state.expiresAt > now.getTime() ? state : null;
}

/** A random token for a consent's nonce or the browser a state is bound to. */
export function randomConsentToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Never part of base64url, which the sealed part is written in. */
const FLOW_SEPARATOR = ".";

/** 256 random bits, like the setup token, beyond guessing. */
const TOKEN_BYTES = 32;

/**
 * Binds a state to its browser and its readable flow, and keeps any other ciphertext the instance
 * makes from passing as one.
 */
function associatedData(flow: string, browserToken: string): string {
  return `google-consent-state:${flow}:${browserToken}`;
}

const CONSENT_STATE = z.discriminatedUnion("flow", [
  z.object({
    flow: z.literal("connect_google_workspace"),
    clientId: z.string(),
    clientSecret: z.string(),
    nonce: z.string(),
    expiresAt: z.number(),
  }),
  z.object({
    flow: z.literal("sign_in_with_google"),
    nonce: z.string(),
    expiresAt: z.number(),
  }),
  z.object({
    flow: z.literal("change_google_app"),
    clientId: z.string(),
    clientSecret: z.string(),
    nonce: z.string(),
    expiresAt: z.number(),
  }),
]);
