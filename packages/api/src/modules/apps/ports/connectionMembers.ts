import type { ImportedAccount } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";

/** The members read from each connection, and when each connection last finished a scan. */
export interface ConnectionMembers {
  /** Saves the invited member, returning its replaced email if any. Null when already saved. */
  addInvitedMember(
    tx: Tx,
    connectionId: string,
    account: ImportedAccount,
  ): Promise<{ previousEmail: string | null } | null>;
  /** Forgets only the member removed from this connection. Joins the account change transaction. */
  removeMember(
    tx: Tx,
    member: { connectionId: string; sourceKey: string; email: string },
  ): Promise<void>;

  /**
   * The members read from one of `connectionIds` with one of `emails`. Trusted read: no `ctx`.
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

/** A member read from a connected app. */
export interface ConnectionMember {
  status: "active" | "suspended";
  displayName: string | null;
  connectionId: string;
  /** Lowercased. */
  email: string;
  /** The app's own id for the member. */
  sourceKey: string;
  /** Whether it is the member whose key or session the connection uses. */
  isConnectionUser: boolean;
}
