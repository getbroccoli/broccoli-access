import type { AppSessionSource } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the connectors module needs from the apps module: connected apps and their connections. */
export interface ConnectedApps {
  /**
   * Approves the connector's app and saves its connection with the secrets encrypted, and the
   * caller as who accepted its notice at `noticeAcceptedAt`, joining `tx`; `sessionFrom` says who
   * made the app session in `secrets`. Refuses a connector already connected with CONFLICT.
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
      sessionFrom?: AppSessionSource;
    },
  ): Promise<{ appId: string; connectionId: string }>;
  /**
   * Replaces the connection's secrets and sets it connected, joining `tx`, with its history;
   * `sessionFrom` says who made the app session in `secrets`, and left out keeps what is stored.
   */
  reconnect(
    ctx: SecurityContext,
    tx: Tx,
    reconnection: {
      connectionId: string;
      secrets: Record<string, unknown>;
      sessionFrom?: AppSessionSource;
    },
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
      sessionFrom: AppSessionSource | null;
    }[]
  >;
  /** The connection with its secrets from one stored version, or null. Never for a client. */
  readConnectionWithSecrets(
    db: Orm | Tx,
    connectionId: string,
  ): Promise<{
    connection: {
      id: string;
      connector: string;
      settings: Record<string, unknown>;
      sessionFrom: AppSessionSource | null;
    };
    secrets: Record<string, unknown>;
  } | null>;
  /**
   * Replaces the connection's secrets, joining `tx`, unless they are no longer `replacing`; returns
   * whether it saved.
   */
  changeConnection(
    ctx: SecurityContext,
    tx: Tx,
    connectionId: string,
    update: { secrets: Record<string, unknown>; replacing: Record<string, unknown> },
  ): Promise<boolean>;
}
