import { ApplicationError, type FieldError, invalidInput } from "../../../core/applicationError";
import {
  createGoogleRelayClient,
  GoogleRelayError,
  type GoogleClient,
  type GoogleCustomer,
  type GoogleTokens,
  type GoogleUser,
  type OpenIdConfiguration,
} from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";
import {
  GOOGLE_SIGN_IN_SCOPES,
  GOOGLE_WORKSPACE_SCOPES,
  type GoogleWorkspaceSettings,
  googleRedirectAddress,
  NotSuperAdminError,
} from "../domain";
import {
  sealConsentState,
  randomConsentToken,
  type ConsentState,
  type RelayConsentState,
  type GoogleIdentity,
  verifyIdToken,
} from "../helpers";

import type { SecretBox } from "../../../core/secrets";
import { consentUrl } from "./consentUrl";

/** The consenting super admin and their Workspace customer. */
export type SuperAdmin = GoogleUser & GoogleCustomer;

/** What Google's answer proved: the tokens it granted, with a refresh token, and who consented. */
export interface VerifiedGrant {
  clientId: string;
  tokens: GoogleTokens & { refreshToken: string };
  identity: GoogleIdentity;
}

/** Starts either Google app with the same browser binding and nonce verification. */
export async function startConsent(
  google: GoogleClient,
  secretBox: SecretBox,
  start: GoogleConsentStart,
  relayUrl?: string,
): Promise<string> {
  const nonce = randomConsentToken();
  const redirectUri = googleRedirectAddress(start.publicOrigin);
  if (start.googleApp === "broccoli_google_app") {
    const relay = requireGoogleRelay(relayUrl);
    const codeVerifier = randomConsentToken();
    const state = sealConsentState(
      secretBox,
      { flow: start.flow, nonce, codeVerifier, revision: start.revision },
      start,
    );
    return relay.authorize({
      returnTo: redirectUri,
      state,
      codeVerifier,
      nonce,
      purpose: start.flow === "sign_in_with_google" ? "sign_in" : "connect",
    });
  }
  const credentials = parseCredentials(start.clientId, start.clientSecret);
  const ownState =
    start.flow === "sign_in_with_google"
      ? { flow: start.flow, nonce }
      : { flow: start.flow, ...credentials, nonce, revision: start.revision };
  const state = sealConsentState(secretBox, ownState, start);
  const { authorizationEndpoint } = await google.discover();
  const signingIn = start.flow === "sign_in_with_google";
  return consentUrl(
    authorizationEndpoint,
    {
      clientId: credentials.clientId,
      redirectUri,
      state,
      nonce,
      scopes: signingIn ? GOOGLE_SIGN_IN_SCOPES : GOOGLE_WORKSPACE_SCOPES,
    },
    signingIn ? {} : { access_type: "offline", prompt: "consent" },
  );
}

interface GoogleConsentStart {
  revision?: string;
  flow: ConsentState["flow"];
  googleApp?: GoogleWorkspaceSettings["googleApp"];
  clientId?: string;
  clientSecret?: string;
  publicOrigin: string;
  browserToken: string;
  now: Date;
}

/**
 * Exchanges the code of a Google Workspace consent, at setup or for a new Google app, and checks
 * the ID token, the refresh token and every scope asked for.
 */
export async function verifyGrant(
  google: GoogleClient,
  consent: IdentityConsent,
  answer: ConsentExchange,
  relayUrl?: string,
): Promise<VerifiedGrant> {
  const { tokens, identity, clientId } = await verifyIdentity(google, consent, answer, relayUrl);
  const { refreshToken } = tokens;
  if (refreshToken === null) {
    throw new ApplicationError("INVALID_INPUT", "Google gave no refresh token.");
  }
  if (GOOGLE_WORKSPACE_SCOPES.some((scope) => !tokens.scopes.includes(scope))) {
    throw new ApplicationError("INVALID_INPUT", "The admin did not allow every permission.");
  }
  return { tokens: { ...tokens, refreshToken }, identity, clientId };
}

/** Verifies an identity from a direct code or a relay handoff against Google's own keys. */
export async function verifyIdentity(
  google: GoogleClient,
  consent: IdentityConsent,
  answer: ConsentExchange,
  relayUrl?: string,
): Promise<{ tokens: GoogleTokens; identity: GoogleIdentity; clientId: string }> {
  const shared = "codeVerifier" in consent;
  if (
    shared
      ? !answer.handle || answer.code !== undefined
      : !answer.code || answer.handle !== undefined
  ) {
    throw new ApplicationError("INVALID_INPUT", "The answer does not match this consent.");
  }
  const relay = shared ? requireGoogleRelay(relayUrl) : undefined;
  const openId = await google.discover();
  const { clientId, ...tokens } = await refusingRejectedCode(async () => {
    if ("codeVerifier" in consent) {
      return relay!.redeem(answer.handle!, consent.codeVerifier);
    }
    return {
      ...(await google.exchangeCode(openId, {
        ...consent,
        code: answer.code!,
        redirectUri: answer.redirectUri,
      })),
      clientId: consent.clientId,
    };
  });
  const identity = await verifiedIdentity(google, openId, tokens.idToken, {
    clientId,
    nonce: consent.nonce,
    now: answer.now,
  });
  return { tokens, identity, clientId };
}

function requireGoogleRelay(relayUrl?: string) {
  if (!relayUrl)
    throw new ApplicationError("UNAVAILABLE", "The Broccoli Google app is not available.");
  return createGoogleRelayClient(relayUrl);
}

type IdentityConsent =
  { clientId: string; clientSecret: string; nonce: string } | RelayConsentState;
interface ConsentExchange {
  code?: string;
  handle?: string;
  redirectUri: string;
  now: Date;
}

/** Google refuses a used or expired code, and a wrong client secret, with a 4xx answer. */
async function refusingRejectedCode<T>(exchange: () => Promise<T>): Promise<T> {
  try {
    return await exchange();
  } catch (error) {
    if (error instanceof GoogleRelayError && error.code === "invalid_handoff") {
      throw new ApplicationError(
        "INVALID_INPUT",
        "The Google consent expired or was already used.",
      );
    }
    throw error instanceof UnsuccessfulAnswerError && error.status < SERVER_ERROR_STATUS
      ? new ApplicationError("INVALID_INPUT", `Google refused the code with ${error.status}.`)
      : error;
  }
}

const SERVER_ERROR_STATUS = 500;

async function verifiedIdentity(
  google: GoogleClient,
  openId: OpenIdConfiguration,
  idToken: string,
  { clientId, nonce, now }: { clientId: string; nonce: string; now: Date },
): Promise<GoogleIdentity> {
  const keys = await google.readSigningKeys(openId);
  try {
    return await verifyIdToken(idToken, { keys, issuer: openId.issuer, clientId, nonce, now });
  } catch {
    throw new ApplicationError("INVALID_INPUT", "Google's ID token did not verify.");
  }
}

/** The consenting user and their customer, refused with `NotSuperAdminError` unless a super admin. */
export async function readSuperAdmin(
  google: GoogleClient,
  accessToken: string,
  { sub }: GoogleIdentity,
): Promise<SuperAdmin> {
  try {
    const customer = await google.readCustomer(accessToken);
    const user = await google.findUser(accessToken, sub);
    if (!user?.isAdmin) {
      throw new NotSuperAdminError();
    }
    return { ...user, ...customer };
  } catch (error) {
    // The Directory refuses anyone but an admin.
    throw error instanceof UnsuccessfulAnswerError && error.status === FORBIDDEN_STATUS
      ? new NotSuperAdminError()
      : error;
  }
}

const FORBIDDEN_STATUS = 403;

function parseCredentials(clientId = "", clientSecret = "") {
  const credentials = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  const fieldErrors: FieldError[] = Object.entries(credentials)
    .filter(([, value]) => value === "")
    .map(([field]) => ({ field, code: "required" }));
  if (fieldErrors.length > 0) throw invalidInput(fieldErrors);
  return credentials;
}
