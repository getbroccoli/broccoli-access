import { isDeepStrictEqual } from "node:util";

import type { AppSession } from "@broccoli-access/connector-contract";

import { ApplicationError, invalidInput } from "../../../core/applicationError";
import {
  CONNECTOR_ERROR_CODES,
  ConnectorError,
  type ConnectorErrorCode,
  signsInAsIntegrationUser,
  withConnectorRetries,
} from "../../../core/connectors";
import type { SecurityContext } from "../../../core/security";
import { parseAppSession } from "../domain";
import type { SignedInConnection, SignInFailure } from "../ports";
import type { ContainerConnectionDependencies } from "./containerConnectionService";
import { appSessionFieldOf, type ContainerConnector } from "./containerConnectors";

/** What signing in as the integration user needs. */
export type SignInDependencies = Pick<
  ContainerConnectionDependencies,
  "integrationUser" | "logger" | "wait"
>;

/**
 * The connection the integration user's sign-in to the connector's app made, trying a rate-limited
 * or unavailable sign-in again. Refuses a connector that cannot sign in with CONFLICT; a sign-in
 * the owner can put right, or one that opens another workspace than `stored`'s, with
 * INVALID_INPUT on `integrationUser` and its code; any other failure, and an answer without the
 * app session the connector names, with UNAVAILABLE. The session comes parsed, beside the answer.
 */
export async function integrationUserSession(
  dependencies: SignInDependencies,
  ctx: SecurityContext,
  connector: ContainerConnector,
  stored: { id: string; settings: Record<string, unknown> } | undefined,
): Promise<SignedInConnection & { appSession: AppSession }> {
  if (!signsInAsIntegrationUser(connector)) {
    throw new ApplicationError(
      "CONFLICT",
      "This connector cannot sign in as the integration user.",
    );
  }
  // A connection that exists names its workspace, so a user in several signs in to that one.
  const renewing = stored && { settings: stored.settings, secrets: {} };
  const signedIn = await signInAgain(dependencies, ctx, connector, stored, renewing);
  if ("failure" in signedIn) {
    throw refusalOf(signedIn.failure);
  }
  return signedIn;
}

/**
 * The integration user's sign-in as `integrationUserSession` makes it, answering why not instead of
 * refusing. With `renewing`, the stored connection goes to the container, which signs in to that
 * workspace.
 */
export async function signInAgain(
  dependencies: SignInDependencies,
  ctx: SecurityContext,
  connector: ContainerConnector,
  stored: { id: string; settings: Record<string, unknown> } | undefined,
  renewing?: { settings: Record<string, unknown>; secrets: Record<string, unknown> },
): Promise<(SignedInConnection & { appSession: AppSession }) | SignInFailure> {
  const { logger } = dependencies;
  const signedIn = await signInWithRetries(dependencies, ctx, connector, renewing);
  if ("failure" in signedIn) {
    return signedIn;
  }
  const appSession = appSessionOf(connector, signedIn);
  if (!appSession) {
    logger.warn({ connector: connector.key }, "Sign-in answered without the app session");
    return { failure: "unexpected_response" };
  }
  if (stored && !isDeepStrictEqual(signedIn.connection.settings, stored.settings)) {
    logger.warn(
      { connector: connector.key, connectionId: stored.id },
      "Sign-in refused: the integration user's session opens another workspace",
    );
    return { failure: "wrong_workspace" };
  }
  return { ...signedIn, appSession };
}

/** The sign-in's answer, after up to three attempts at one that is rate-limited or unavailable. */
async function signInWithRetries(
  { integrationUser, logger, wait }: SignInDependencies,
  ctx: SecurityContext,
  connector: ContainerConnector,
  renewing?: { settings: Record<string, unknown>; secrets: Record<string, unknown> },
): Promise<SignedInConnection | SignInFailure> {
  try {
    return await withConnectorRetries(
      async () => {
        const signedIn = await integrationUser.signInToApp(ctx, connector.key, renewing);
        // Thrown, so the shared retries decide which of the connector's errors pass on their own.
        if ("failure" in signedIn && isConnectorError(signedIn.failure)) {
          throw new ConnectorError(signedIn.failure);
        }
        return signedIn;
      },
      {
        wait,
        onRetry: (failure, attempt) =>
          logger.info(
            { connector: connector.key, failure, attempt },
            "Integration user's sign-in to the app failed; trying again",
          ),
      },
    );
  } catch (error) {
    if (!(error instanceof ConnectorError)) {
      throw error;
    }
    return { failure: error.code };
  }
}

function isConnectorError(failure: SignInFailure["failure"]): failure is ConnectorErrorCode {
  return (CONNECTOR_ERROR_CODES as readonly string[]).includes(failure);
}

/** The session the answer's secrets hold under the key the connector's manifest names; null without one, or for an empty one. */
function appSessionOf(
  connector: ContainerConnector,
  { connection }: SignedInConnection,
): AppSession | null {
  const field = appSessionFieldOf(connector);
  const session = field && parseAppSession(connection.secrets[field.key], field);
  const holdsAny =
    !!session && (session.cookies.length > 0 || Object.keys(session.storage ?? {}).length > 0);
  return holdsAny ? session : null;
}

function refusalOf(failure: SignInFailure["failure"]): ApplicationError {
  return OWNER_CAN_PUT_RIGHT.includes(failure)
    ? invalidInput([{ field: "integrationUser", code: failure }])
    : new ApplicationError("UNAVAILABLE", "The integration user could not sign in to the app.");
}

/** The failures the owner ends themselves: an invitation, a role, a check, a password or the setup. */
const OWNER_CAN_PUT_RIGHT: readonly SignInFailure["failure"][] = [
  "not_invited",
  "permission_missing",
  "blocked_by_check",
  "authentication_failed",
  "wrong_workspace",
  "not_set_up",
];
