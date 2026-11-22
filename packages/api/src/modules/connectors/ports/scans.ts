import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the connectors module needs from the imports module: the first scan of a new connection. */
export interface Scans {
  /** Queues a scan of the connection, into a source named `sourceName` on the first, joining `tx`. */
  scanConnection(
    ctx: SecurityContext,
    tx: Tx,
    scan: { connectionId: string; sourceName: string },
  ): Promise<{ sourceId: string }>;
}
