import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the connectors module needs from the apps module: connected apps and their connections. */
export interface ConnectedApps {
  /**
   * Approves the connector's app and saves its connection with the secrets encrypted, joining
   * `tx`; refuses a connector already connected with CONFLICT.
   */
  connectApp(
    ctx: SecurityContext,
    tx: Tx,
    connection: {
      connector: string;
      app: { name: string; domain: string | null };
      settings: Record<string, unknown>;
      secrets: Record<string, unknown>;
    },
  ): Promise<{ appId: string; connectionId: string }>;
  /** Every connection, without its secrets. */
  readConnections(db: Orm | Tx): Promise<
    {
      id: string;
      connector: string;
      appId: string;
      settings: Record<string, unknown>;
    }[]
  >;
}
