import type { Orm, Tx } from "../../../core/db";
import { type ConnectionMember, importSourceRepository } from "../db";

/** What other modules read of the records the scans saved. */
export interface ImportRecordService {
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
    findConnectionMembers: (db, members) =>
      importSourceRepository(db).findConnectionMembers(members),
    findLastScans: async (db) =>
      (await importSourceRepository(db).findAll()).flatMap(({ connectionId, readAt }) =>
        readAt === null ? [] : [{ connectionId, scannedAt: readAt }],
      ),
  };
}
