import { isDeepStrictEqual } from "node:util";

import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { signsInAsIntegrationUser } from "../../../core/connectors";
import type { SecurityContext } from "../../../core/security";
import type { SignedInConnection, SignInFailure } from "../ports";
import type { ContainerConnectionDependencies } from "./containerConnectionService";
import type { ContainerConnector } from "./containerConnectors";

/**
 * The connection the integration user's sign-in to the connector's app made. Refuses a connector
 * that cannot sign in with CONFLICT; a sign-in the owner can put right, or one that opens another
 * workspace than `stored`'s, with INVALID_INPUT on `integrationUser` and its code; any other
 * failure with UNAVAILABLE.
 */
export async function integrationUserSession(
  { integrationUser, logger }: ContainerConnectionDependencies,
  ctx: SecurityContext,
  connector: ContainerConnector,
  stored: { id: string; settings: Record<string, unknown> } | undefined,
): Promise<SignedInConnection> {
  if (!signsInAsIntegrationUser(connector)) {
    throw new ApplicationError(
      "CONFLICT",
      "This connector cannot sign in as the integration user.",
    );
  }
  const signedIn = await integrationUser.signInToApp(ctx, connector.key);
  if ("failure" in signedIn) {
    throw refusalOf(signedIn.failure);
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
