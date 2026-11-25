import type { ConnectorErrorCode } from "@broccoli-access/connector-contract";

import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the connectors module needs from the Google module: app sessions made as the integration user. */
export interface IntegrationUserSignIn {
  /**
   * Signs in to the connector's app as the integration user and answers the connection with its
   * new session, or why not: the container's error, or `not_set_up` until the integration user
   * signs in to Google with two steps.
   */
  signInToApp(
    ctx: SecurityContext,
    connector: string,
    /** The stored connection when renewing its session; left out for a first sign-in. */
    renewing?: { settings: Record<string, unknown>; secrets: Record<string, unknown> },
  ): Promise<SignedInConnection | SignInFailure>;
  /** Whether the directory's last scan found the integration user suspended. Trusted read. */
  isSuspendedInDirectory(db: Orm | Tx): Promise<boolean>;
}

/** The workspace the integration user's session opens, with the connection that holds the session. */
export interface SignedInConnection {
  details: { organizationName: string; domain: string | null };
  connection: { settings: Record<string, unknown>; secrets: Record<string, unknown> };
}

export interface SignInFailure {
  failure: ConnectorErrorCode | "not_set_up";
}
