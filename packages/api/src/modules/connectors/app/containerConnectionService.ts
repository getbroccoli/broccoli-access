import { ApplicationError, invalidInput } from "../../../core/applicationError";
import {
  type ConnectionDetails,
  ConnectorError,
  type ConnectorErrorCode,
  withConnectorRetries,
} from "../../../core/connectors";
import type { Orm, Transact } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { adminUrlOf } from "../domain";
import type { ConnectedApps, Scans } from "../ports";
import type { ContainerConnector, ContainerConnectors } from "./containerConnectors";

/** Apps connected through the connectors container: connecting one, and reading them for Settings. */
export interface ContainerConnectionService {
  /**
   * Connects a container connector whose fields are all text with the owner's `values`: tests them
   * with the app, trying a rate-limited or unavailable test again, then in one transaction saves
   * the connection (secret fields encrypted, the rest with the test's settings), approves its app
   * and queues its first scan into a source named after the workspace; returns the connector with
   * its connection. Needs MANAGE_WORKSPACE. Refuses an unknown connector with NOT_FOUND, an app
   * session field or a connected app with CONFLICT, a missing, repeated, unknown or refused value
   * with INVALID_INPUT, and a failing test with UNAVAILABLE; a refusal stores nothing.
   */
  connect: (
    ctx: SecurityContext,
    input: { connector: string; values: readonly { key: string; value: string }[] },
  ) => Promise<ConnectorWithConnection>;
  /** The container's connectors in its order, each with its connection. Needs MANAGE_WORKSPACE. */
  listConnectors: (ctx: SecurityContext) => Promise<ConnectorWithConnection[]>;
  /** The connections through the container of those of `appIds` that have one, by app id. Needs MANAGE_WORKSPACE. */
  readConnectionsOfApps: (
    ctx: SecurityContext,
    appIds: readonly string[],
  ) => Promise<Map<string, ContainerConnection>>;
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
  /** The connector it connects through. */
  connector: ContainerConnector;
}

export interface ContainerConnectionDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  containerConnectors: ContainerConnectors;
  connectedApps: ConnectedApps;
  scans: Scans;
  /** Waits between attempts of the connection test; tests pass one that does not wait. */
  wait?: (ms: number) => Promise<void>;
}

export function createContainerConnectionService(
  dependencies: ContainerConnectionDependencies,
): ContainerConnectionService {
  const { orm, containerConnectors, connectedApps } = dependencies;
  return {
    async connect(ctx, { connector: key, values }) {
      ctx.require("MANAGE_WORKSPACE");
      const connector = await typedConnector(containerConnectors, key);
      const connection = connectionOf(connector, values);
      const connections = await connectedApps.readConnections(orm);
      if (connections.some((candidate) => candidate.connector === key)) {
        throw new ApplicationError("CONFLICT", "This app is already connected.");
      }
      const details = await testedConnection(dependencies, connector, connection);
      return saveConnection(dependencies, ctx, { connector, connection, details });
    },
    async listConnectors(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      const [connectors, connections] = await Promise.all([
        containerConnectors.list(),
        connectedApps.readConnections(orm),
      ]);
      return connectors.map((connector) => {
        const connection = connections.find((candidate) => candidate.connector === connector.key);
        return { connector, connection: connection ? summaryOf(connector, connection) : null };
      });
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
  };
}

/** The connector errors that mean the app refused the values, which the owner can correct. */
const REFUSED_VALUES: readonly ConnectorErrorCode[] = [
  "authentication_failed",
  "permission_missing",
  "wrong_workspace",
];

/** The listed connector with `key`, whose fields the owner can type. */
async function typedConnector(
  containerConnectors: ContainerConnectors,
  key: string,
): Promise<ContainerConnector> {
  const connector = (await containerConnectors.list()).find((candidate) => candidate.key === key);
  if (!connector) {
    throw new ApplicationError(
      "NOT_FOUND",
      "The connectors container has no connector with this key.",
    );
  }
  if (connector.connectionFields.some(({ kind }) => kind !== "text")) {
    throw new ApplicationError(
      "CONFLICT",
      "This connector connects with an app session, not typed values.",
    );
  }
  return connector;
}

/** The trimmed values as the connection's settings and secrets, refusing a missing or unknown one. */
function connectionOf(
  connector: ContainerConnector,
  values: readonly { key: string; value: string }[],
): { settings: Record<string, string>; secrets: Record<string, string> } {
  const valueByKey = new Map(values.map(({ key, value }) => [key, value.trim()]));
  const fieldKeys = new Set(connector.connectionFields.map(({ key }) => key));
  const keys = values.map(({ key }) => key);
  const repeatedKeys = new Set(keys.filter((key, index) => keys.indexOf(key) !== index));
  const fieldErrors = [
    ...[...repeatedKeys].map((key) => ({ field: `values.${key}`, code: "duplicate" })),
    ...[...fieldKeys]
      .filter((key) => !valueByKey.get(key))
      .map((key) => ({ field: `values.${key}`, code: "required" })),
    ...[...valueByKey.keys()]
      .filter((key) => !fieldKeys.has(key))
      .map((key) => ({ field: `values.${key}`, code: "unknown" })),
  ];
  if (fieldErrors.length > 0) {
    throw invalidInput(fieldErrors);
  }
  const fieldsWhere = (secret: boolean) =>
    Object.fromEntries(
      connector.connectionFields
        .filter((field) => field.secret === secret)
        .map(({ key }) => [key, valueByKey.get(key)!]),
    );
  return { settings: fieldsWhere(false), secrets: fieldsWhere(true) };
}

/** The app's answer to the values; a refusal is invalid input, any other failure unavailable. */
async function testedConnection(
  { logger, wait }: ContainerConnectionDependencies,
  connector: ContainerConnector,
  connection: { settings: Record<string, string>; secrets: Record<string, string> },
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
      throw invalidInput([{ field: "values", code: error.code }]);
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
  }: {
    connector: ContainerConnector;
    connection: { settings: Record<string, string>; secrets: Record<string, string> };
    details: ConnectionDetails;
  },
): Promise<ConnectorWithConnection> {
  const settings = { ...connection.settings, ...details.connection?.settings };
  const saved = await transact(async (tx) => {
    const { appId, connectionId } = await connectedApps.connectApp(ctx, tx, {
      connector: connector.key,
      app: { name: connector.name, domain: connector.appDomain },
      settings,
      secrets: details.connection?.secrets ?? connection.secrets,
    });
    const scan = { connectionId, sourceName: details.organizationName };
    const { sourceId } = await scans.scanConnection(ctx, tx, scan);
    return { appId, connectionId, sourceId };
  });
  logger.info(
    { connector: connector.key, ...saved },
    "App connected through the connectors container; its scan is queued",
  );
  return { connector, connection: summaryOf(connector, { id: saved.connectionId, settings }) };
}

function summaryOf(
  connector: ContainerConnector,
  connection: { id: string; settings: Record<string, unknown> },
): ContainerConnection {
  return {
    id: connection.id,
    adminUrl: adminUrlOf(connector.adminUrl, connection.settings),
    connector,
  };
}
