import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { SecretBox } from "../../../core/secrets";

/**
 * What the OAuth `state` carries from the start of a consent to Google's answer, encrypted for the
 * browser that started it, so only that browser redeems it: what the consent is for and the ID
 * token's nonce.
 */
export type ConsentState =
  | WorkspaceConsentState
  | SignInState
  | GoogleAppChangeState
  | WriteConsentState
  | RelayConsentState;

/** The relay's compact state carries the proof needed to redeem its one-use handoff. */
export interface RelayConsentState {
  flow:
    | WorkspaceConsentState["flow"]
    | SignInState["flow"]
    | GoogleAppChangeState["flow"]
    | WriteConsentState["flow"];
  nonce: string;
  codeVerifier: string;
  revision?: string;
  expiresAt: number;
}

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
  revision?: string;
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

/** The owner creating the integration user, carrying the address they picked for it. */
export interface IntegrationUserCreationState {
  flow: "create_integration_user";
  email: string;
  /** The connection's stored version at the start, kept in compact state for the relay. */
  revision?: string;
  nonce?: string;
  /** Epoch milliseconds after which Google's answer is refused. */
  expiresAt: number;
}

/** The owner allowing changes to the directory's users, carrying the page they came from. */
export interface UserWriteConsentState {
  flow: "allow_user_writes";
  /** The instance's own path the owner goes back to. */
  returnTo: string;
  /** The connection's stored version at the start, kept in compact state for the relay. */
  revision?: string;
  nonce?: string;
  /** Epoch milliseconds after which Google's answer is refused. */
  expiresAt: number;
}

export type WriteConsentState = IntegrationUserCreationState | UserWriteConsentState;

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
    | Omit<WorkspaceConsentState | GoogleAppChangeState, "expiresAt">
    | Omit<SignInState, "expiresAt">
    | Omit<IntegrationUserCreationState, "expiresAt">
    | Omit<UserWriteConsentState, "expiresAt">
    | Omit<RelayConsentState, "expiresAt">,
  { browserToken, now }: { browserToken: string; now: Date },
): string {
  const expiresAt = now.getTime() + CONSENT_LIFETIME_MS;
  if ("codeVerifier" in state) {
    const prefix = RELAY_PREFIXES[state.flow];
    const sealed = secretBox.encrypt(
      JSON.stringify([
        state.nonce,
        state.codeVerifier,
        expiresAt,
        ...(state.revision ? [state.revision] : []),
      ]),
      associatedData(prefix, browserToken),
    );
    return `${prefix}${sealed}`;
  }
  const sealed = secretBox.encrypt(
    JSON.stringify({ ...state, expiresAt }),
    associatedData(state.flow, browserToken),
  );
  return `${state.flow}${FLOW_SEPARATOR}${sealed}`;
}

/** The flow `sealed` says it is for, unverified: only to choose the use case that opens it. */
export function consentFlowOf(sealed: string): string {
  for (const [flow, prefix] of Object.entries(RELAY_PREFIXES)) {
    if (sealed.startsWith(prefix)) return flow;
  }
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
  try {
    const prefix = RELAY_PREFIXES[flow as RelayConsentState["flow"]];
    if (prefix && sealed.startsWith(prefix)) {
      const plaintext = secretBox.decrypt(
        sealed.slice(prefix.length),
        associatedData(prefix, browserToken),
      );
      const [nonce, codeVerifier, expiresAt, revision] = RELAY_STATE.parse(JSON.parse(plaintext));
      return expiresAt > now.getTime()
        ? {
            flow: flow as RelayConsentState["flow"],
            nonce,
            codeVerifier,
            revision,
            expiresAt,
          }
        : null;
    }
    const encrypted = sealed.slice(flow.length + FLOW_SEPARATOR.length);
    const plaintext = secretBox.decrypt(encrypted, associatedData(flow, browserToken));
    const state = CONSENT_STATE.parse(JSON.parse(plaintext));
    return state.expiresAt > now.getTime() ? state : null;
  } catch {
    return null;
  }
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
    revision: z.string().optional(),
    clientId: z.string(),
    clientSecret: z.string(),
    nonce: z.string(),
    expiresAt: z.number(),
  }),
  z.object({
    flow: z.literal("create_integration_user"),
    email: z.string(),
    revision: z.string().optional(),
    nonce: z.string().optional(),
    expiresAt: z.number(),
  }),
  z.object({
    flow: z.literal("allow_user_writes"),
    returnTo: z.string(),
    revision: z.string().optional(),
    nonce: z.string().optional(),
    expiresAt: z.number(),
  }),
]);

/** Short prefixes keep relay states URL-safe and below its 256-character limit. */
const RELAY_PREFIXES = {
  connect_google_workspace: "r0_",
  sign_in_with_google: "r1_",
  change_google_app: "r2_",
  create_integration_user: "r3_",
  allow_user_writes: "r4_",
} as const;
const RELAY_STATE = z.tuple([z.string(), z.string(), z.number(), z.string().optional()]);
