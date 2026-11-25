import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { type AppSessionSource, canListAccounts } from "../../../core/connectors";
import type { Orm, Transact } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import { parseAppSession } from "../domain";
import type { ConnectedApps, IntegrationUserSignIn, Scans } from "../ports";
import { type AppSessionHandOver, createAppSessionHandOvers } from "./appSessionHandOvers";
import { connectionOf, isOtherWorkspace, refuseOtherWorkspace } from "./connectionOf";
import { connectWithIntegrationUser } from "./connectWithIntegrationUser";
import { replaceSecrets, saveConnection, summaryOf } from "./saveConnection";
import { createSessionRenewals } from "./sessionRenewals";
import { testedConnection } from "./testedConnection";
import {
  appSessionFieldOf,
  type ContainerConnector,
  type ContainerConnectors,
  findAppSessionConnector,
} from "./containerConnectors";

/**
 * Apps connected through the connectors container: handing over an app session, connecting one,
 * and reading them for Settings.
 */
export interface ContainerConnectionService {
  /**
   * Connects a container connector with the owner's typed `values`, or, for one with an app
   * session field, the `appSession` sealed at its hand-over: tests them with the app, trying a
   * rate-limited or unavailable test again, then in one transaction saves the connection (secrets
   * encrypted, settings from the test, and the notice accepted now), approves its app and queues
   * its first scan into a source named after the workspace; returns the connector with its
   * connection. Needs MANAGE_WORKSPACE. Refuses an unknown connector with NOT_FOUND, a connected
   * app with CONFLICT, a notice not accepted, a missing, repeated, unknown or refused value, or a
   * missing, changed, expired or another's session with INVALID_INPUT, and a failing test with
   * UNAVAILABLE; a refusal stores nothing.
   */
  connect: (
    ctx: SecurityContext,
    input: {
      connector: string;
      values?: readonly { key: string; value: string }[];
      appSession?: string | null;
      noticeAccepted?: boolean;
    },
  ) => Promise<ConnectorWithConnection>;
  /**
   * Reconnects a connected container connector with new typed `values`, or the `appSession`
   * sealed at a new hand-over: tests them with the app, trying a rate-limited or unavailable test
   * again, then in one transaction replaces the connection's secrets (a session the test renewed
   * wins), sets it connected and queues its scan; returns the connector with its connection. Needs
   * MANAGE_WORKSPACE. Refuses an unknown or unconnected connector with NOT_FOUND; what `connect`
   * refuses as given by the owner, and values or a session whose test finds other settings than
   * the stored ones (another workspace), with INVALID_INPUT; and a failing test with UNAVAILABLE;
   * a refusal changes nothing.
   */
  reconnect: (
    ctx: SecurityContext,
    input: {
      connector: string;
      values?: readonly { key: string; value: string }[];
      appSession?: string | null;
    },
  ) => Promise<ConnectorWithConnection>;
  /**
   * Signs in to a container connector's app as the integration user. For a connector not connected
   * yet it stores nothing: the session waits sealed as `handOver`, for five minutes, until the
   * owner confirms the workspace it reached with `connect`. On a connected connector it switches:
   * the new session, which must open the connection's workspace, replaces the stored one, and its
   * scan is queued. Needs MANAGE_WORKSPACE. Refuses an unknown connector with NOT_FOUND, one that
   * cannot sign in with CONFLICT, a first sign-in without the notice accepted with INVALID_INPUT,
   * a sign-in the owner can put right with INVALID_INPUT on `integrationUser` and its code
   * (`not_invited`, `permission_missing`, `blocked_by_check`, `authentication_failed`,
   * `wrong_workspace`, `not_set_up`, or `scan_running` for a switch while the connection's scan
   * runs), and any other failing sign-in, after trying a rate-limited or unavailable one again,
   * with UNAVAILABLE; a refusal changes nothing.
   */
  connectWithIntegrationUser: (
    ctx: SecurityContext,
    input: { connector: string; noticeAccepted?: boolean },
  ) => Promise<IntegrationUserConnection>;
  /**
   * What the extension collects for the connector's app session field. Trusted: the extension's
   * token was checked. Refuses an unknown connector with NOT_FOUND, and one without an app session
   * field with CONFLICT.
   */
  describeAppSession: (connector: string) => Promise<AppSessionRequest>;
  /**
   * Tests the app session the extension collected for `userId`, then seals it for them and the
   * connector, for five minutes, as their hand-over `requestId`. Trusted: the extension's token
   * was checked and gave `userId`. Refuses like `describeAppSession`, a blank request id or a
   * session holding anything its field does not name with INVALID_INPUT, a session the app
   * refuses with INVALID_INPUT on `appSession`, and a failing test with UNAVAILABLE.
   */
  handOverAppSession: (handOver: {
    userId: string;
    connector: string;
    requestId: string;
    appSession: unknown;
  }) => Promise<void>;
  /** The caller's hand-over `requestId` while unexpired; null otherwise. Needs MANAGE_WORKSPACE. */
  readAppSessionHandOver: (
    ctx: SecurityContext,
    requestId: string,
  ) => Promise<AppSessionHandOver | null>;
  /**
   * Whether the connection signs in as the integration user while the directory's last scan found
   * it suspended, so its calls stop. Needs MANAGE_WORKSPACE.
   */
  readIntegrationUserSuspended: (ctx: SecurityContext, connectionId: string) => Promise<boolean>;
  /** The container's connectors in its order, each with its connection. Needs MANAGE_WORKSPACE. */
  listConnectors: (ctx: SecurityContext) => Promise<ConnectorWithConnection[]>;
  /** The connections through the container of those of `appIds` that have one, by app id. Needs MANAGE_WORKSPACE. */
  readConnectionsOfApps: (
    ctx: SecurityContext,
    appIds: readonly string[],
  ) => Promise<Map<string, ContainerConnection>>;
  /**
   * The connectors that can manage the apps with `catalogKeys`, each with its connection, by
   * catalog key: those whose key is the app's catalog key and that change accounts. Needs
   * MANAGE_WORKSPACE.
   */
  readManagingConnectors: (
    ctx: SecurityContext,
    catalogKeys: readonly string[],
  ) => Promise<Map<string, ConnectorWithConnection>>;
  /**
   * The apps a connector can manage that have no app yet, named as the catalog names them, in the
   * container's order; computed when read, so nothing is stored until one connects. Needs
   * MANAGE_WORKSPACE.
   */
  listAppsToConnect: (ctx: SecurityContext) => Promise<AppToConnect[]>;
}

/** A container connector with its connection; null until connected. */
export interface ConnectorWithConnection {
  connector: ContainerConnector;
  connection: ContainerConnection | null;
}

/** What signing in as the integration user gave: the switched connection, or the session to confirm. */
export interface IntegrationUserConnection extends ConnectorWithConnection {
  /** The workspace a first sign-in reached, sealed with its session; null after a switch. */
  handOver: AppSessionHandOver | null;
}

/** A connection through the connectors container, as Settings and its app's page show it. */
export interface ContainerConnection {
  id: string;
  /** Where the owner manages the app's members; null when the settings lack a value it names. */
  adminUrl: string | null;
  /** When the owner accepted the connector's notice; null for a connector without one. */
  noticeAcceptedAt: Date | null;
  /** Who made its app session; null for a connection without one. */
  sessionFrom: AppSessionSource | null;
  /** The connector it connects through. */
  connector: ContainerConnector;
}

/** An app a connector can manage that no scan found and nothing connected yet. */
export interface AppToConnect {
  catalogKey: string;
  name: string;
  domain: string;
  /** The connector that connects it, whose key is its catalog key. */
  connector: ContainerConnector;
}

/** What the extension collects for a connector's app session. */
export interface AppSessionRequest {
  connector: string;
  /** The app's name, which the extension shows the owner. */
  name: string;
  domains: readonly string[];
  storageKeys: readonly string[];
}

export interface ContainerConnectionDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  containerConnectors: ContainerConnectors;
  connectedApps: ConnectedApps;
  scans: Scans;
  integrationUser: IntegrationUserSignIn;
  secretBox: SecretBox;
  /** Waits between attempts of the connection test; tests pass one that does not wait. */
  wait?: (ms: number) => Promise<void>;
  /** The clock; tests pass a fixed one. */
  now?: () => Date;
}

export function createContainerConnectionService(
  dependencies: ContainerConnectionDependencies,
): ContainerConnectionService {
  const { orm, containerConnectors, connectedApps, logger } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const handOvers = createAppSessionHandOvers({ secretBox: dependencies.secretBox, now });
  const renewals = createSessionRenewals(dependencies);
  return {
    async connect(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const connector = await containerConnectors.find(input.connector);
      if (connector.notice !== null && input.noticeAccepted !== true) {
        throw invalidInput([{ field: "noticeAccepted", code: "required" }]);
      }
      const connection = connectionOf(ctx, connector, input, { handOvers, logger });
      const connections = await connectedApps.readConnections(orm);
      if (connections.some((candidate) => candidate.connector === connector.key)) {
        throw new ApplicationError("CONFLICT", "This app is already connected.");
      }
      const details = await testedConnection(dependencies, connector, connection);
      if (appSessionFieldOf(connector) && isOtherWorkspace(connection, details)) {
        logger.warn(
          { connector: connector.key },
          "Connect refused: the session opens another workspace",
        );
        throw invalidInput([{ field: "appSession", code: "wrong_workspace" }]);
      }
      const noticeAcceptedAt = connector.notice === null ? undefined : now();
      return saveConnection(dependencies, ctx, {
        connector,
        connection,
        details,
        noticeAcceptedAt,
        sessionFrom: connection.sessionFrom,
      });
    },
    async reconnect(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const connector = await containerConnectors.find(input.connector);
      const stored = (await connectedApps.readConnections(orm)).find(
        (candidate) => candidate.connector === connector.key,
      );
      if (!stored) {
        throw new ApplicationError("NOT_FOUND", "This app is not connected.");
      }
      const connection = connectionOf(ctx, connector, input, { handOvers, logger });
      const details = await testedConnection(dependencies, connector, connection);
      refuseOtherWorkspace({ connector, connection, details, stored }, logger);
      const secrets = details.connection?.secrets ?? connection.secrets;
      const { sessionFrom } = connection;
      return replaceSecrets(dependencies, ctx, { connector, stored, secrets, sessionFrom });
    },
    connectWithIntegrationUser: (ctx, input) =>
      connectWithIntegrationUser(dependencies, handOvers, ctx, input),
    async describeAppSession(key) {
      const { connector, field } = await findAppSessionConnector(containerConnectors, key);
      const { domains, storageKeys } = field;
      return { connector: connector.key, name: connector.name, domains, storageKeys };
    },
    async handOverAppSession({ userId, connector: key, requestId, appSession }) {
      if (requestId.trim() === "") {
        throw invalidInput([{ field: "requestId", code: "invalid" }]);
      }
      const { connector, field } = await findAppSessionConnector(containerConnectors, key);
      const session = parseAppSession(appSession, field);
      if (!session) {
        logger.warn({ connector: key, userId }, "App session refused: not what its field names");
        throw invalidInput([{ field: "appSession", code: "invalid" }]);
      }
      const connection = { settings: {}, secrets: { [field.key]: session } };
      const details = await testedConnection(dependencies, connector, connection);
      // The test may renew the session, which then replaces the one the owner handed over.
      const renewed = parseAppSession(details.connection?.secrets?.[field.key], field);
      const handOver = { userId, requestId, connector: key, appSession: renewed ?? session };
      if (!handOvers.keep({ ...handOver, details })) {
        logger.warn({ connector: key, userId }, "App session refused: too large to connect with");
        throw invalidInput([{ field: "appSession", code: "too_large" }]);
      }
      logger.info({ connector: key, userId }, "App session handed over; waiting for the owner");
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- A refusal rejects, as in every other operation.
    async readAppSessionHandOver(ctx, requestId) {
      ctx.require("MANAGE_WORKSPACE");
      return ctx.user && handOvers.read(ctx.user.userId, requestId);
    },
    readIntegrationUserSuspended(ctx, connectionId) {
      ctx.require("MANAGE_WORKSPACE");
      return renewals.isStopped(connectionId);
    },
    listConnectors(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return connectorsWithConnections(dependencies);
    },
    async readConnectionsOfApps(ctx, appIds) {
      ctx.require("MANAGE_WORKSPACE");
      const [connectors, connections] = await Promise.all([
        containerConnectors.list(),
        connectedApps.readConnections(orm),
      ]);
      return new Map(
        connections.flatMap((connection) => {
          const connector = connectors.find(({ key }) => key === connection.connector);
          return connector && appIds.includes(connection.appId)
            ? [[connection.appId, summaryOf(connector, connection)] as const]
            : [];
        }),
      );
    },
    async readManagingConnectors(ctx, catalogKeys) {
      ctx.require("MANAGE_WORKSPACE");
      const connectors = await connectorsWithConnections(dependencies);
      return new Map(
        connectors
          .filter(
            ({ connector }) => catalogKeys.includes(connector.key) && canListAccounts(connector),
          )
          .map((managing) => [managing.connector.key, managing]),
      );
    },
    async listAppsToConnect(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      // A connected connector may read an app it matched by name, which has no catalog key.
      const managing = (await connectorsWithConnections(dependencies))
        .filter(({ connector, connection }) => !connection && canListAccounts(connector))
        .map(({ connector }) => connector);
      const catalogApps = await connectedApps.readCatalogAppsWithoutApp(
        orm,
        managing.map(({ key }) => key),
      );
      return managing.flatMap((connector) => {
        const app = catalogApps.find(({ key }) => key === connector.key);
        return app ? [{ catalogKey: app.key, name: app.name, domain: app.domain, connector }] : [];
      });
    },
  };
}

/** The container's connectors in its order, each with its connection; null until connected. */
async function connectorsWithConnections({
  orm,
  containerConnectors,
  connectedApps,
}: ContainerConnectionDependencies): Promise<ConnectorWithConnection[]> {
  const [connectors, connections] = await Promise.all([
    containerConnectors.list(),
    connectedApps.readConnections(orm),
  ]);
  return connectors.map((connector) => {
    const connection = connections.find((candidate) => candidate.connector === connector.key);
    return { connector, connection: connection ? summaryOf(connector, connection) : null };
  });
}
