import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the Google module needs from the imports module: a scan of the new connection. */
export interface Scans {
  /** Queues a scan of the connection, joining `tx`. */
  scanConnection(ctx: SecurityContext, tx: Tx, connectionId: string): Promise<{ sourceId: string }>;
}
