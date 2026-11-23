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
}

export function createImportRecordService(): ImportRecordService {
  return {
    findConnectionMembers: (db, members) =>
      importSourceRepository(db).findConnectionMembers(members),
  };
}
