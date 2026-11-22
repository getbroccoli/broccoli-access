import { ApplicationError, invalidInput } from "../../../core/applicationError";
import {
  canChangeAccounts,
  type ConnectionDetails,
  ConnectorError,
  type ConnectorErrorCode,
  withConnectorRetries,
} from "../../../core/connectors";
import type { Orm, Transact } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import { adminUrlOf, parseAppSession } from "../domain";
import type { ConnectedApps, Scans } from "../ports";
import { type AppSessionHandOver, createAppSessionHandOvers } from "./appSessionHandOvers";
import { type Connection, connectionOf } from "./connectionOf";
import {
  type AppSessionField,
  appSessionFieldOf,
  type ContainerConnector,
  type ContainerConnectors,
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

/** A connection through the connectors container, as Settings and its app's page show it. */
export interface ContainerConnection {
  id: string;
  /** Where the owner manages the app's members; null when the settings lack a value it names. */
  adminUrl: string | null;
  /** When the owner accepted the connector's notice; null for a connector without one. */
  noticeAcceptedAt: Date | null;
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
      const noticeAcceptedAt = connector.notice === null ? undefined : now();
      return saveConnection(dependencies, ctx, {
        connector,
        connection,
        details,
        noticeAcceptedAt,
      });
    },
    async describeAppSession(key) {
      const { connector, field } = await appSessionConnector(containerConnectors, key);
      const { domains, storageKeys } = field;
      return { connector: connector.key, name: connector.name, domains, storageKeys };
    },
    async handOverAppSession({ userId, connector: key, requestId, appSession }) {
      if (requestId.trim() === "") {
        throw invalidInput([{ field: "requestId", code: "invalid" }]);
      }
      const { connector, field } = await appSessionConnector(containerConnectors, key);
      const session = parseAppSession(appSession, field);
      if (!session) {
        logger.warn({ connector: key, userId }, "App session refused: not what its field names");
        throw invalidInput([{ field: "appSession", code: "invalid" }]);
      }
      const connection = { settings: {}, secrets: { [field.key]: session } };
      const details = await testedConnection(dependencies, connector, connection);
      handOvers.keep({ userId, requestId, connector: key, appSession: session, details });
      logger.info({ connector: key, userId }, "App session handed over; waiting for the owner");
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- A refusal rejects, as in every other operation.
    async readAppSessionHandOver(ctx, requestId) {
      ctx.require("MANAGE_WORKSPACE");
      return ctx.user && handOvers.read(ctx.user.userId, requestId);
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
            ({ connector }) => catalogKeys.includes(connector.key) && canChangeAccounts(connector),
          )
          .map((managing) => [managing.connector.key, managing]),
      );
    },
    async listAppsToConnect(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      // A connected connector may read an app it matched by name, which has no catalog key.
      const managing = (await connectorsWithConnections(dependencies))
        .filter(({ connector, connection }) => !connection && canChangeAccounts(connector))
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

/** The connector errors that mean the app refused the values, which the owner can correct. */
const REFUSED_VALUES: readonly ConnectorErrorCode[] = [
  "authentication_failed",
  "permission_missing",
  "wrong_workspace",
];

/** The listed connector with `key` and its app session field. */
async function appSessionConnector(
  containerConnectors: ContainerConnectors,
  key: string,
): Promise<{ connector: ContainerConnector; field: AppSessionField & { key: string } }> {
  const connector = await containerConnectors.find(key);
  const field = appSessionFieldOf(connector);
  if (!field) {
    throw new ApplicationError(
      "CONFLICT",
      "This connector connects with typed values, not an app session.",
    );
  }
  return { connector, field };
}

/**
 * The app's answer to the connection; a refusal is invalid input on what the owner gave (the
 * values or the app session), any other failure unavailable.
 */
async function testedConnection(
  { logger, wait }: ContainerConnectionDependencies,
  connector: ContainerConnector,
  connection: Connection,
): Promise<ConnectionDetails> {
  try {
    const session = await connector.openSession(connection);
    return await withConnectorRetries(() => session.testConnection(), {
      wait,
      onRetry: (failure, attempt) =>
        logger.info(
          { connector: connector.key, failure, attempt },
          "Connection test failed; trying again",
        ),
    });
  } catch (error) {
    if (!(error instanceof ConnectorError)) {
      throw error;
    }
    logger.warn({ connector: connector.key, failure: error.code }, "Connection test failed");
    if (REFUSED_VALUES.includes(error.code)) {
      const field = appSessionFieldOf(connector) ? "appSession" : "values";
      throw invalidInput([{ field, code: error.code }]);
    }
    throw new ApplicationError("UNAVAILABLE", "The app did not answer the connection test.");
  }
}

/** Writes the connection, its approved app and its first scan together, then logs the outcome. */
async function saveConnection(
  { transact, connectedApps, scans, logger }: ContainerConnectionDependencies,
  ctx: SecurityContext,
  {
    connector,
    connection,
    details,
    noticeAcceptedAt,
  }: {
    connector: ContainerConnector;
    connection: Connection;
    details: ConnectionDetails;
    noticeAcceptedAt: Date | undefined;
  },
): Promise<ConnectorWithConnection> {
  const settings = { ...connection.settings, ...details.connection?.settings };
  const saved = await transact(async (tx) => {
    const { appId, connectionId } = await connectedApps.connectApp(ctx, tx, {
      connector: connector.key,
      app: { name: connector.name, domain: connector.appDomain },
      settings,
      secrets: details.connection?.secrets ?? connection.secrets,
      noticeAcceptedAt,
    });
    const scan = { connectionId, sourceName: details.organizationName };
    const { sourceId } = await scans.scanConnection(ctx, tx, scan);
    return { appId, connectionId, sourceId };
  });
  logger.info(
    { connector: connector.key, ...saved },
    "App connected through the connectors container; its scan is queued",
  );
  const summary = summaryOf(connector, {
    id: saved.connectionId,
    settings,
    noticeAcceptedAt: noticeAcceptedAt ?? null,
  });
  return { connector, connection: summary };
}

function summaryOf(
  connector: ContainerConnector,
  connection: { id: string; settings: Record<string, unknown>; noticeAcceptedAt: Date | null },
): ContainerConnection {
  return {
    id: connection.id,
    adminUrl: adminUrlOf(connector.adminUrl, connection.settings),
    noticeAcceptedAt: connection.noticeAcceptedAt,
    connector,
  };
}
