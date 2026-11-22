import { ApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import { createOwnerService } from "../../../core/instance";
import { createGoogleClient } from "../../../integrations/google";
import {
  GOOGLE_SIGN_IN_SCOPES,
  GOOGLE_WORKSPACE,
  GOOGLE_WORKSPACE_SECRETS,
  googleRedirectAddress,
  parseGoogleWorkspaceSettings,
  UnknownGoogleAccountError,
} from "../domain";
import { openConsentState, randomConsentToken, sealConsentState } from "../helpers";
import type { ConnectedApps } from "../ports";
import { consentUrl } from "./consentUrl";
import type { GoogleConnectionDependencies } from "./googleConnectionService";
import { verifyIdentity } from "./verifyGrant";

const owners = createOwnerService();

/**
 * Signing in with Google, through the Google app of the Google Workspace connection. Public: Google
 * proves who signs in, and only a user with that Google account gets in.
 */
export interface GoogleSignInService {
  /**
   * Google's sign-in address, and a new token for the browser its `state` is bound to, which the
   * caller keeps in that browser until Google answers. Refuses with CONFLICT before Google
   * Workspace is connected.
   */
  startSignIn: (start: SignInStart) => Promise<{ authorizationUrl: string; browserToken: string }>;
  /**
   * Google's answer to a sign-in: the user whose Google account signed in. Refuses an answer it
   * cannot trust with INVALID_INPUT, and a Google account of no user with
   * `UnknownGoogleAccountError`. Writes nothing and keeps none of Google's tokens.
   */
  finishSignIn: (answer: SignInAnswer) => Promise<{ userId: string }>;
}

export interface SignInStart {
  /** Where browsers reach the instance; Google redirects to its callback there. */
  publicOrigin: string;
  now: Date;
}

/** Google's redirect back after the person chose their account. */
export interface SignInAnswer {
  code: string;
  state: string;
  publicOrigin: string;
  /** The token `startSignIn` gave the browser; null when the browser has none. */
  browserToken: string | null;
  now: Date;
}

type GoogleSignInDependencies = Pick<
  GoogleConnectionDependencies,
  "orm" | "secretBox" | "openIdConfigurationUrl" | "adminApiUrl" | "connectedApps"
>;

export function createGoogleSignInService(
  dependencies: GoogleSignInDependencies,
): GoogleSignInService {
  const { orm, secretBox, connectedApps } = dependencies;
  const google = createGoogleClient(dependencies);
  return {
    async startSignIn({ publicOrigin, now }) {
      const { clientId } = await readClient(connectedApps, orm);
      const nonce = randomConsentToken();
      const browserToken = randomConsentToken();
      const state = sealConsentState(
        secretBox,
        { flow: "sign_in_with_google", nonce },
        { browserToken, now },
      );
      const { authorizationEndpoint } = await google.discover();
      const authorizationUrl = consentUrl(authorizationEndpoint, {
        clientId,
        redirectUri: googleRedirectAddress(publicOrigin),
        scopes: GOOGLE_SIGN_IN_SCOPES,
        state,
        nonce,
      });
      return { authorizationUrl, browserToken };
    },
    async finishSignIn({ code, state, publicOrigin, browserToken, now }) {
      const signIn =
        browserToken === null ? null : openConsentState(secretBox, state, { browserToken, now });
      if (signIn?.flow !== "sign_in_with_google") {
        throw new ApplicationError(
          "INVALID_INPUT",
          "The sign-in expired or was not this browser's.",
        );
      }
      const client = await readClient(connectedApps, orm);
      const { identity } = await verifyIdentity(
        google,
        { ...client, nonce: signIn.nonce },
        { code, redirectUri: googleRedirectAddress(publicOrigin), now },
      );
      const userId = await owners.findUserIdByGoogleAccount(orm, identity.sub);
      if (userId === null) {
        throw new UnknownGoogleAccountError();
      }
      return { userId };
    },
  };
}

/** The Google app of the Google Workspace connection; refuses with CONFLICT before it exists. */
async function readClient(
  connectedApps: ConnectedApps,
  orm: Orm,
): Promise<{ clientId: string; clientSecret: string }> {
  const connection = await connectedApps.readConnection(orm, GOOGLE_WORKSPACE);
  if (!connection) {
    throw new ApplicationError("CONFLICT", "Google Workspace is not connected.");
  }
  const { clientId } = parseGoogleWorkspaceSettings(connection.settings);
  const secrets = await connectedApps.readSecrets(orm, connection.id);
  return { clientId, clientSecret: GOOGLE_WORKSPACE_SECRETS.parse(secrets).clientSecret };
}
