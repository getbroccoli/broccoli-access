import type { ConnectorErrorCode } from "@broccoli-access/connector-contract";

import type { SecurityContext } from "../../../core/security";

/** What the connectors module needs from the Google module: app sessions made as the integration user. */
export interface IntegrationUserSignIn {
  /**
   * Signs in to the connector's app as the integration user and answers the connection with its
   * new session, or why not: the container's error, or `not_set_up` until the integration user
   * signs in to Google with two steps.
   */
  signInToApp(ctx: SecurityContext, connector: string): Promise<SignedInConnection | SignInFailure>;
}

/** The workspace the integration user's session opens, with the connection that holds the session. */
export interface SignedInConnection {
  details: { organizationName: string; domain: string | null };
  connection: { settings: Record<string, unknown>; secrets: Record<string, unknown> };
}

export interface SignInFailure {
  failure: ConnectorErrorCode | "not_set_up";
}
