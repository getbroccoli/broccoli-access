import type { Orm, Tx } from "../../../core/db";
import { type ConnectionMember, importSourceRepository } from "../db";

/** What other modules read of the records the scans saved. */
export interface ImportRecordService {
  /** The scan source ID stored in the history of findings from this connection. */
  findSourceId(db: Orm | Tx, connectionId: string): Promise<string | null>;
  /** The email of the connection’s member with this stable id, from its last saved scan. */
  findMemberEmail(db: Orm | Tx, connectionId: string, sourceKey: string): Promise<string | null>;
  /** Forgets only the member removed from this connection. Joins the account change transaction. */
  removeMember(
    tx: Tx,
    member: { connectionId: string; sourceKey: string; email: string },
  ): Promise<void>;

  /**
   * The members with one of `emails` that the last saved scan of one of `connectionIds` found.
   * Trusted read: no `ctx`.
   */
  findConnectionMembers: (
    db: Orm | Tx,
    members: { connectionIds: readonly string[]; emails: readonly string[] },
  ) => Promise<ConnectionMember[]>;
  /**
   * When the last scan of each connection finished, so its records are saved; a connection never
   * scanned is left out. Trusted read: no `ctx`.
   */
  findLastScans: (db: Orm | Tx) => Promise<{ connectionId: string; scannedAt: Date }[]>;
}

export function createImportRecordService(): ImportRecordService {
  return {
    findSourceId: async (db, connectionId) =>
      (await importSourceRepository(db).findByConnection(connectionId))?.id ?? null,
    findMemberEmail: (db, connectionId, sourceKey) =>
      importSourceRepository(db).findMemberEmail(connectionId, sourceKey),
    removeMember: (tx, member) => importSourceRepository(tx).removeMember(member),
    findConnectionMembers: (db, members) =>
      importSourceRepository(db).findConnectionMembers(members),
    findLastScans: async (db) =>
      (await importSourceRepository(db).findAll()).flatMap(({ connectionId, readAt }) =>
        readAt === null ? [] : [{ connectionId, scannedAt: readAt }],
      ),
  };
}
