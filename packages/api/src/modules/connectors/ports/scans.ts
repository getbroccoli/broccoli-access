import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the connectors module needs from the imports module: the first scan of a new connection. */
export interface Scans {
  /**
   * Queues a scan of the connection, into a source named `sourceName` on the first, joining `tx`;
   * `queued` is false when one already runs, which reads with the secrets it started with.
   */
  scanConnection(
    ctx: SecurityContext,
    tx: Tx,
    scan: { connectionId: string; sourceName: string },
  ): Promise<{ sourceId: string; queued: boolean }>;
  /** The connection's scan; null before the first. `scanning` while one is queued or running. */
  readScan(ctx: SecurityContext, connectionId: string): Promise<{ status: string } | null>;
}
