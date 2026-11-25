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
} from "../domain";
import { randomConsentToken, sealConsentState } from "../helpers";
import type { ConnectedApps } from "../ports";
import { consentUrl } from "./consentUrl";
import type { WriteGrant } from "./integrationUserDirectory";

// shortcut: the Broccoli Google app's relay asks for its own fixed scopes, so only a connection
// with the instance's own Google app can add the write scope; teach the relay the scope to lift this.
/** The connection's own Google app; refuses with CONFLICT before it exists or with the Broccoli app. */
export async function readOwnGoogleApp(
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
  if (settings.googleApp !== "own_google_app" || clientSecret === undefined) {
    throw new ApplicationError(
      "CONFLICT",
      "Creating and changing Google users needs your own Google app.",
    );
  }
  return { connectionId: stored.connection.id, settings, clientSecret, revision: stored.revision };
}

/**
 * Google's consent address for the one write scope, added to what the Google app was granted, with
 * the state `stateOf` gives for its nonce, encrypted for `browserToken`: a new token the caller
 * keeps in the browser until Google answers.
 */
export async function startWriteConsent(
  { google, secretBox }: { google: GoogleClient; secretBox: SecretBox },
  {
    settings,
    publicOrigin,
    now,
  }: { settings: GoogleWorkspaceSettings; publicOrigin: string; now: Date },
  stateOf: (nonce: string) => Parameters<typeof sealConsentState>[1],
): Promise<{ authorizationUrl: string; browserToken: string }> {
  const nonce = randomConsentToken();
  const browserToken = randomConsentToken();
  const state = sealConsentState(secretBox, stateOf(nonce), { browserToken, now });
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
  return { authorizationUrl, browserToken };
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
    secrets: { clientSecret, refreshToken: grant.refreshToken },
    replacingRevision: revision,
  });
}

/** The connection is no longer the version the consent started from, such as after a reconnect. */
export function googleAppChanged(): ApplicationError {
  return new ApplicationError("CONFLICT", "The Google app changed during consent. Try again.");
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

/** The Google Workspace connection with its own Google app's secret, as one stored version. */
export interface ConnectedGoogleApp {
  connectionId: string;
  settings: GoogleWorkspaceSettings;
  clientSecret: string;
  /** The stored version read, which the save replaces or refuses. */
  revision: string;
}
