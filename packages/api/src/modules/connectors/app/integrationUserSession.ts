import { isDeepStrictEqual } from "node:util";

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

/**
 * The connection the integration user's sign-in to the connector's app made, trying a rate-limited
 * or unavailable sign-in again. Refuses a connector that cannot sign in with CONFLICT; a sign-in
 * the owner can put right, or one that opens another workspace than `stored`'s, with
 * INVALID_INPUT on `integrationUser` and its code; any other failure, and an answer without the
 * app session the connector names, with UNAVAILABLE.
 */
export async function integrationUserSession(
  dependencies: ContainerConnectionDependencies,
  ctx: SecurityContext,
  connector: ContainerConnector,
  stored: { id: string; settings: Record<string, unknown> } | undefined,
): Promise<SignedInConnection> {
  const { logger } = dependencies;
  if (!signsInAsIntegrationUser(connector)) {
    throw new ApplicationError(
      "CONFLICT",
      "This connector cannot sign in as the integration user.",
    );
  }
  const signedIn = await signInWithRetries(dependencies, ctx, connector);
  if ("failure" in signedIn) {
    throw refusalOf(signedIn.failure);
  }
  if (!holdsAppSession(connector, signedIn)) {
    logger.warn({ connector: connector.key }, "Sign-in answered without the app session");
    throw refusalOf("unexpected_response");
  }
  if (stored && !isDeepStrictEqual(signedIn.connection.settings, stored.settings)) {
    logger.warn(
      { connector: connector.key, connectionId: stored.id },
      "Switch refused: the integration user's session opens another workspace",
    );
    throw refusalOf("wrong_workspace");
  }
  return signedIn;
}

/** The sign-in's answer, after up to three attempts at one that is rate-limited or unavailable. */
async function signInWithRetries(
  { integrationUser, logger, wait }: ContainerConnectionDependencies,
  ctx: SecurityContext,
  connector: ContainerConnector,
): Promise<SignedInConnection | SignInFailure> {
  try {
    return await withConnectorRetries(
      async () => {
        const signedIn = await integrationUser.signInToApp(ctx, connector.key);
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

/** Whether the answer's secrets hold, under the key the connector's manifest names, a session that is not empty. */
function holdsAppSession(
  connector: ContainerConnector,
  { connection }: SignedInConnection,
): boolean {
  const field = appSessionFieldOf(connector);
  const session = field && parseAppSession(connection.secrets[field.key], field);
  return !!session && (session.cookies.length > 0 || Object.keys(session.storage ?? {}).length > 0);
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
