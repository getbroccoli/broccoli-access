import { isDeepStrictEqual } from "node:util";

import type { ConnectorErrorCode, SessionRenewal, SessionRenewals } from "../../../core/connectors";
import type { SecurityContext } from "../../../core/security";
import type { SignInFailure } from "../ports";
import type { ContainerConnectionDependencies } from "./containerConnectionService";
import { signInAgain } from "./integrationUserSession";

/** What renewing needs of the connectors module: everything but the scans it never queues. */
export type RenewalDependencies = Omit<
  ContainerConnectionDependencies,
  "scans" | "secretBox" | "now"
>;

/**
 * Keeps a connection made by the integration user's sign-in working: signs in again when its
 * session ended, and stops its calls while the directory shows the integration user suspended.
 */
export function createSessionRenewals(dependencies: RenewalDependencies): SessionRenewals {
  // shortcut: one sign-in at a time per connection holds within this process; a second API
  // process could sign in at once, and the later save then keeps the first session.
  const renewing = new Map<string, Promise<SessionRenewal | null>>();
  return {
    renew(ctx, connectionId, staleSecrets) {
      let pending = renewing.get(connectionId);
      if (!pending) {
        pending = renewConnection(dependencies, ctx, connectionId, staleSecrets).finally(() =>
          renewing.delete(connectionId),
        );
        renewing.set(connectionId, pending);
      }
      return pending;
    },
    async isStopped(connectionId) {
      const { orm, connectedApps, integrationUser } = dependencies;
      const stored = (await connectedApps.readConnections(orm)).find(
        ({ id }) => id === connectionId,
      );
      return (
        stored?.sessionFrom === "server_sign_in" && integrationUser.isSuspendedInDirectory(orm)
      );
    },
  };
}

async function renewConnection(
  dependencies: RenewalDependencies,
  ctx: SecurityContext,
  connectionId: string,
  staleSecrets: Record<string, unknown>,
): Promise<SessionRenewal | null> {
  const { orm, transact, connectedApps, containerConnectors, logger } = dependencies;
  const stored = await connectedApps.readConnectionWithSecrets(orm, connectionId);
  if (stored?.connection.sessionFrom !== "server_sign_in") {
    return null;
  }
  // A call that failed alongside this one has renewed the session already.
  if (!isDeepStrictEqual(stored.secrets, staleSecrets)) {
    return { secrets: stored.secrets };
  }
  const { connector: key, settings } = stored.connection;
  const connector = (await containerConnectors.list()).find((candidate) => candidate.key === key);
  if (!connector) {
    return { failure: "app_unavailable" };
  }
  const signedIn = await signInAgain(
    dependencies,
    ctx,
    connector,
    { id: connectionId, settings },
    { settings, secrets: stored.secrets },
  );
  if ("failure" in signedIn) {
    const failure = failureOf(signedIn.failure);
    logger.warn(
      { connector: key, connectionId, failure },
      "Integration user's session did not renew",
    );
    return { failure };
  }
  const { secrets } = signedIn.connection;
  const saved = await transact((tx) =>
    connectedApps.changeConnection(ctx, tx, connectionId, { secrets, replacing: staleSecrets }),
  );
  logger.info({ connector: key, connectionId, saved }, "Integration user's session renewed");
  // A reconnect meanwhile replaced the session this call used; the stored one is the newer.
  return saved
    ? { secrets }
    : { secrets: (await connectedApps.readConnectionWithSecrets(orm, connectionId))!.secrets };
}

/** A sign-in's failure as the error of the call it renewed for: no invitation is no longer an admin. */
function failureOf(failure: SignInFailure["failure"]): ConnectorErrorCode {
  if (failure === "not_invited") return "permission_missing";
  if (failure === "not_set_up") return "authentication_failed";
  return failure;
}
