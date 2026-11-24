import type { Orm, Tx } from "../../../core/db";

/**
 * What the apps module reads from the imports module: the members connections' scans saw, and when
 * each connection last finished a scan.
 */
export interface ConnectionMembers {
  /**
   * The members with one of `emails` that the last saved scan of one of `connectionIds` saw. Trusted
   * read: no `ctx`.
   */
  findConnectionMembers(
    db: Orm | Tx,
    members: { connectionIds: readonly string[]; emails: readonly string[] },
  ): Promise<ConnectionMember[]>;
  /**
   * When the last scan of each connection finished; a connection never scanned is left out.
   * Trusted read: no `ctx`.
   */
  findLastScans(db: Orm | Tx): Promise<{ connectionId: string; scannedAt: Date }[]>;
}

/** A member of a connected app as its connection's last scan saw it. */
export interface ConnectionMember {
  connectionId: string;
  /** Lowercased. */
  email: string;
  /** The app's own id for the member. */
  sourceKey: string;
  /** Whether it is the member whose key or session the connection uses. */
  isConnectionUser: boolean;
}
