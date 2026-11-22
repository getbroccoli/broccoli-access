import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the Google module needs from the apps module: the connected app and its connection. */
export interface ConnectedApps {
  /** Creates the catalog app, approved, and saves its connection with the secrets encrypted, joining `tx`. */
  connectApp(
    ctx: SecurityContext,
    tx: Tx,
    connection: {
      catalogKey: string;
      connector: string;
      settings: Record<string, unknown>;
      secrets: Record<string, string>;
    },
  ): Promise<{ appId: string; connectionId: string }>;
  /** The connection of `connector` without its secrets, or null. */
  readConnection(
    db: Orm | Tx,
    connector: string,
  ): Promise<{ id: string; settings: Record<string, unknown> } | null>;
  /** The secrets of connection `connectionId`, decrypted, or null for an unknown connection. */
  readSecrets(db: Orm | Tx, connectionId: string): Promise<Record<string, string> | null>;
}
