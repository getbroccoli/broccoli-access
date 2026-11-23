import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the connectors module needs from the apps module: connected apps and their connections. */
export interface ConnectedApps {
  /**
   * Approves the connector's app and saves its connection with the secrets encrypted, and the
   * caller as who accepted its notice at `noticeAcceptedAt`, joining `tx`; refuses a connector
   * already connected with CONFLICT.
   */
  connectApp(
    ctx: SecurityContext,
    tx: Tx,
    connection: {
      connector: string;
      app: { name: string; domain: string | null };
      settings: Record<string, unknown>;
      secrets: Record<string, unknown>;
      noticeAcceptedAt?: Date;
    },
  ): Promise<{ appId: string; connectionId: string }>;
  /** Replaces the connection's secrets and sets it connected, joining `tx`, with its history. */
  reconnect(
    ctx: SecurityContext,
    tx: Tx,
    connectionId: string,
    secrets: Record<string, unknown>,
  ): Promise<void>;
  /** The catalog apps among `catalogKeys` that have no app yet, whatever its status. */
  readCatalogAppsWithoutApp(
    db: Orm | Tx,
    catalogKeys: readonly string[],
  ): Promise<{ key: string; name: string; domain: string }[]>;
  /** Every connection, without its secrets. */
  readConnections(db: Orm | Tx): Promise<
    {
      id: string;
      connector: string;
      appId: string;
      settings: Record<string, unknown>;
      noticeAcceptedAt: Date | null;
    }[]
  >;
}
