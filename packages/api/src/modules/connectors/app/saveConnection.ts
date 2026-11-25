import type { AppSessionSource, ConnectionDetails } from "../../../core/connectors";
import type { SecurityContext } from "../../../core/security";
import { adminUrlOf } from "../domain";
import type { Connection } from "./connectionOf";
import type {
  ConnectorWithConnection,
  ContainerConnection,
  ContainerConnectionDependencies,
} from "./containerConnectionService";
import type { ContainerConnector } from "./containerConnectors";

/** Writes the connection, its approved app and its first scan together, then logs the outcome. */
export async function saveConnection(
  { transact, connectedApps, scans, logger }: ContainerConnectionDependencies,
  ctx: SecurityContext,
  {
    connector,
    connection,
    details,
    noticeAcceptedAt,
    sessionFrom,
  }: {
    connector: ContainerConnector;
    connection: Connection;
    details: ConnectionDetails;
    noticeAcceptedAt: Date | undefined;
    sessionFrom: AppSessionSource | undefined;
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
      sessionFrom,
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
    sessionFrom: sessionFrom ?? null,
  });
  return { connector, connection: summary };
}

/** Replaces a connection's secrets and queues its scan together, then logs the outcome. */
export async function replaceSecrets(
  { transact, connectedApps, scans, logger }: ContainerConnectionDependencies,
  ctx: SecurityContext,
  {
    connector,
    stored,
    secrets,
    sessionFrom,
  }: {
    connector: ContainerConnector;
    stored: StoredConnection;
    secrets: Record<string, unknown>;
    sessionFrom: AppSessionSource | undefined;
  },
): Promise<ConnectorWithConnection> {
  const connectionId = stored.id;
  const { sourceId } = await transact(async (tx) => {
    // The source first, then the connection, as a failing scan locks them, so they never deadlock.
    // The source exists since the first scan, which named it.
    const scan = await scans.scanConnection(ctx, tx, { connectionId, sourceName: connector.name });
    await connectedApps.reconnect(ctx, tx, { connectionId, secrets, sessionFrom });
    return scan;
  });
  logger.info(
    { connector: connector.key, connectionId, sourceId, sessionFrom },
    "App reconnected through the connectors container; a scan is queued or running",
  );
  const summary = summaryOf(connector, {
    ...stored,
    sessionFrom: sessionFrom ?? stored.sessionFrom,
  });
  return { connector, connection: summary };
}

/** What a connection's summary reads of the stored connection. */
interface StoredConnection {
  id: string;
  settings: Record<string, unknown>;
  noticeAcceptedAt: Date | null;
  sessionFrom: AppSessionSource | null;
}

export function summaryOf(
  connector: ContainerConnector,
  connection: StoredConnection,
): ContainerConnection {
  return {
    id: connection.id,
    adminUrl: adminUrlOf(connector.adminUrl, connection.settings),
    noticeAcceptedAt: connection.noticeAcceptedAt,
    sessionFrom: connection.sessionFrom,
    connector,
  };
}
