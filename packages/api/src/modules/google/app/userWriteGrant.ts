import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import type { GoogleClient } from "../../../integrations/google";
import {
  GOOGLE_USER_WRITE_SCOPE,
  GOOGLE_WORKSPACE,
  GOOGLE_WORKSPACE_SECRETS,
  googleRedirectAddress,
  type GoogleWorkspaceSettings,
  parseGoogleWorkspaceSettings,
  requireSameWorkspace,
  UserWriteRefusedError,
} from "../domain";
import {
  openConsentState,
  randomConsentToken,
  sealConsentState,
  type WriteConsentState,
} from "../helpers";
import type { ConnectedApps } from "../ports";
import { consentUrl } from "./consentUrl";
import {
  consentRedirectAddress,
  readSuperAdmin,
  requireGoogleRelay,
  sharedConsentOrigin,
  verifyIdentity,
} from "./googleConsent";
import type { GoogleConnectionDependencies } from "./googleConnectionService";

/** The Google Workspace connection and its secrets, as one stored version. */
export interface ConnectedGoogleApp {
  connectionId: string;
  settings: GoogleWorkspaceSettings;
  clientSecret: string | undefined;
  revision: string;
}

/** The Google app in use; refuses with CONFLICT before the workspace is connected. */
export async function readConnectedGoogleApp(
  connectedApps: ConnectedApps,
  orm: Orm,
): Promise<ConnectedGoogleApp> {
  const connection = await connectedApps.readConnection(orm, GOOGLE_WORKSPACE);
  const stored = connection && (await connectedApps.readConnectionWithSecrets(orm, connection.id));
  if (!stored) {
    throw new ApplicationError("CONFLICT", "Google Workspace is not connected.");
  }
  const settings = parseGoogleWorkspaceSettings(stored.connection.settings);
  const { clientSecret } = GOOGLE_WORKSPACE_SECRETS.parse(stored.secrets);
  if (settings.googleApp === "own_google_app" && clientSecret === undefined) {
    throw new ApplicationError(
      "CONFLICT",
      "Reconnect Google Workspace to create and change Google users.",
    );
  }
  return {
    connectionId: stored.connection.id,
    settings,
    clientSecret: settings.googleApp === "own_google_app" ? clientSecret : undefined,
    revision: stored.revision,
  };
}

/**
 * Asks for the write scope alongside the existing grant. The browser keeps the returned token
 * until Google answers.
 */
export async function startWriteConsent(
  { google, orm, secretBox, publicUrl, relayUrl }: WriteConsentDependencies,
  { settings, revision }: ConnectedGoogleApp,
  { publicOrigin, now, ...details }: WriteConsentStart,
): Promise<WriteConsentDestination> {
  const nonce = randomConsentToken();
  if (settings.googleApp === "broccoli_google_app") {
    const relay = requireGoogleRelay(relayUrl);
    const callbackOrigin = await sharedConsentOrigin(orm, publicUrl);
    const codeVerifier = randomConsentToken();
    // The relay caps state length. Bind the email or return path to the same proof in the cookie.
    const browserToken = sealConsentState(secretBox, details, { browserToken: codeVerifier, now });
    const state = sealConsentState(
      secretBox,
      { flow: details.flow, revision, nonce, codeVerifier },
      { browserToken, now },
    );
    const authorizationUrl = relay.authorize({
      returnTo: googleRedirectAddress(callbackOrigin),
      state,
      codeVerifier,
      nonce,
      purpose: "user_write",
    });
    return { authorizationUrl, browserToken, callbackOrigin };
  }
  const browserToken = randomConsentToken();
  const state = sealConsentState(secretBox, { ...details, nonce, revision }, { browserToken, now });
  const { authorizationEndpoint } = await google.discover();
  const authorizationUrl = consentUrl(
    authorizationEndpoint,
    {
      clientId: settings.clientId,
      redirectUri: googleRedirectAddress(publicOrigin),
      scopes: USER_WRITE_CONSENT_SCOPES,
      state,
      nonce,
    },
    INCREMENTAL_OFFLINE_CONSENT,
  );
  return { authorizationUrl, browserToken, callbackOrigin: publicOrigin };
}

/** Opens the write consent and, for a relay answer, its details from the same browser. */
export function openWriteConsent(
  secretBox: SecretBox,
  { state, browserToken, now }: { state: string; browserToken: string | null; now: Date },
): WriteConsent | null {
  if (browserToken === null) return null;
  const opened = openConsentState(secretBox, state, { browserToken, now });
  if (opened?.flow !== "create_integration_user" && opened?.flow !== "allow_user_writes")
    return null;
  const { revision, nonce } = opened;
  if (!revision || !nonce) return null;
  if (!("codeVerifier" in opened)) return { ...opened, revision, nonce };
  const { codeVerifier } = opened;
  const details = openConsentState(secretBox, browserToken, { browserToken: codeVerifier, now });
  return details?.flow === opened.flow && !("codeVerifier" in details)
    ? { ...details, codeVerifier, nonce, revision }
    : null;
}

/** Verifies a super admin of the connected workspace granted write access and kept earlier scopes. */
export async function verifyWriteGrant(
  dependencies: WriteConsentDependencies,
  { settings, clientSecret, revision }: ConnectedGoogleApp,
  { consent, ...answer }: WriteConsentAnswer & { consent: WriteConsent },
): Promise<WriteGrant> {
  const { google, relayUrl } = dependencies;
  const shared = "codeVerifier" in consent;
  if (consent.revision !== revision || shared !== (settings.googleApp === "broccoli_google_app")) {
    throw googleAppChanged();
  }
  const { tokens, identity, clientId } = await verifyIdentity(
    google,
    shared
      ? consent
      : { clientId: settings.clientId, clientSecret: clientSecret!, nonce: consent.nonce },
    {
      ...answer,
      redirectUri: await consentRedirectAddress(dependencies, consent, answer.publicOrigin),
    },
    relayUrl,
  );
  if (clientId !== settings.clientId) throw googleAppChanged();
  if (!tokens.scopes.includes(GOOGLE_USER_WRITE_SCOPE)) {
    throw new UserWriteRefusedError();
  }
  const admin = await readSuperAdmin(google, tokens.accessToken, identity);
  requireSameWorkspace(settings, admin.domain);
  const { accessToken, refreshToken, scopes } = tokens;
  // The new refresh token must keep the access needed by directory scans.
  if (refreshToken === null || settings.grantedScopes.some((scope) => !scopes.includes(scope))) {
    throw new ApplicationError("INVALID_INPUT", "Google's grant does not hold the earlier one.");
  }
  return { accessToken, refreshToken, scopes, adminEmail: admin.email };
}

/**
 * Stores the grant on the connection the consent started from, joining `tx`: its scopes, its
 * admin and that admin's refresh token. False when the connection changed meanwhile.
 */
export function saveWriteGrant(
  connectedApps: ConnectedApps,
  ctx: SecurityContext,
  tx: Tx,
  { connectionId, settings, clientSecret, revision }: ConnectedGoogleApp,
  grant: WriteGrant,
): Promise<boolean> {
  return connectedApps.changeConnection(ctx, tx, connectionId, {
    settings: { ...settings, adminEmail: grant.adminEmail, grantedScopes: grant.scopes },
    secrets: {
      ...(clientSecret !== undefined && { clientSecret }),
      refreshToken: grant.refreshToken,
    },
    replacingRevision: revision,
  });
}

/** The connection is no longer the version the consent started from, such as after a reconnect. */
export function googleAppChanged(): ApplicationError {
  return new ApplicationError("CONFLICT", "The Google app changed during consent. Try again.");
}

export interface WriteConsentDestination {
  authorizationUrl: string;
  browserToken: string;
  callbackOrigin: string;
}

type WriteConsentDependencies = Pick<
  GoogleConnectionDependencies,
  "orm" | "secretBox" | "publicUrl" | "relayUrl"
> & { google: GoogleClient };

type WriteConsentStart = { publicOrigin: string; now: Date } & (
  | { flow: "create_integration_user"; email: string }
  | { flow: "allow_user_writes"; returnTo: string }
);

type VersionedWriteConsent = WriteConsentState & { nonce: string; revision: string };

export type WriteConsent =
  VersionedWriteConsent | (VersionedWriteConsent & { codeVerifier: string });

interface WriteConsentAnswer {
  code?: string;
  handle?: string;
  publicOrigin: string;
  now: Date;
}

/** The access token for immediate writes and the expanded offline grant to store. */
export interface WriteGrant {
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  adminEmail: string;
}

/**
 * The one new scope, and `openid` so that Google's answer always says who consented, also when
 * another account than the connected admin does.
 */
const USER_WRITE_CONSENT_SCOPES = ["openid", GOOGLE_USER_WRITE_SCOPE];

/**
 * Asks only for the scopes in the request and keeps the ones granted before in the new grant; a
 * consent asked now and offline gives the refresh token that holds them all.
 */
const INCREMENTAL_OFFLINE_CONSENT = {
  include_granted_scopes: "true",
  access_type: "offline",
  prompt: "consent",
};
