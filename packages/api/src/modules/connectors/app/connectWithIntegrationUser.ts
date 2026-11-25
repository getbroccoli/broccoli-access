import { randomUUID } from "node:crypto";

import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { SecurityContext } from "../../../core/security";
import type { AppSessionHandOver, AppSessionHandOvers } from "./appSessionHandOvers";
import type {
  ContainerConnectionDependencies,
  IntegrationUserConnection,
} from "./containerConnectionService";
import type { ContainerConnector } from "./containerConnectors";
import { integrationUserSession } from "./integrationUserSession";
import { replaceSecrets, scanRunning } from "./saveConnection";

/** Signs in as the integration user, as `ContainerConnectionService.connectWithIntegrationUser` says. */
export async function connectWithIntegrationUser(
  dependencies: ContainerConnectionDependencies,
  handOvers: AppSessionHandOvers,
  ctx: SecurityContext,
  input: { connector: string; noticeAccepted?: boolean },
): Promise<IntegrationUserConnection> {
  const { orm, containerConnectors, connectedApps, scans } = dependencies;
  ctx.require("MANAGE_WORKSPACE");
  const connector = await containerConnectors.find(input.connector);
  const stored = (await connectedApps.readConnections(orm)).find(
    (candidate) => candidate.connector === connector.key,
  );
  // A connected connector's notice was accepted when it first connected.
  if (connector.notice !== null && !stored && input.noticeAccepted !== true) {
    throw invalidInput([{ field: "noticeAccepted", code: "required" }]);
  }
  // Before signing in, which accepts the invitation in the app; checked again when it saves.
  const scan =
    stored && stored.sessionFrom !== "server_sign_in" && (await scans.readScan(ctx, stored.id));
  if (scan && scan.status === "scanning") {
    throw scanRunning("server_sign_in");
  }
  const signedIn = await integrationUserSession(dependencies, ctx, connector, stored);
  const sessionFrom = "server_sign_in";
  if (stored) {
    const { secrets } = signedIn.connection;
    const switched = await replaceSecrets(dependencies, ctx, {
      connector,
      stored,
      secrets,
      sessionFrom,
    });
    return { ...switched, handOver: null };
  }
  return {
    connector,
    connection: null,
    handOver: keptToConfirm(dependencies, handOvers, ctx, { connector, signedIn }),
  };
}

/** Keeps the session the sign-in made, sealed for the caller, until they confirm its workspace. */
function keptToConfirm(
  { logger }: ContainerConnectionDependencies,
  handOvers: AppSessionHandOvers,
  ctx: SecurityContext,
  { connector, signedIn }: { connector: ContainerConnector; signedIn: SignedIn },
): AppSessionHandOver | null {
  const { details, connection, appSession } = signedIn;
  const { organizationName, domain } = details;
  // Only a signed-in user confirms a workspace: the sealed session is theirs alone.
  if (!ctx.user) {
    throw new ApplicationError("FORBIDDEN", "Only a signed-in admin connects an app.");
  }
  const { userId } = ctx.user;
  const requestId = randomUUID();
  const kept = handOvers.keep({
    userId,
    requestId,
    connector: connector.key,
    appSession,
    details: { organizationName, domain, connection: { settings: connection.settings } },
    sessionFrom: "server_sign_in",
  });
  if (!kept) {
    logger.warn({ connector: connector.key, userId }, "Sign-in's session is too large to confirm");
    throw new ApplicationError("UNAVAILABLE", "The app's session is too large to connect with.");
  }
  logger.info(
    { connector: connector.key, userId },
    "Integration user's session waits for the owner to confirm its workspace",
  );
  return handOvers.read(userId, requestId);
}

type SignedIn = Awaited<ReturnType<typeof integrationUserSession>>;
