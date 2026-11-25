import type { ImportedAccount } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { type ConnectionMember, importSourceRepository } from "../db";

/** What other modules use of the records read from each connection. */
export interface ImportRecordService {
  /** The scan source ID stored in the history of findings from this connection. */
  findSourceId(db: Orm | Tx, connectionId: string): Promise<string | null>;
  /** The email of the connection’s member with this stable id, from its last saved scan. */
  findMemberEmail(db: Orm | Tx, connectionId: string, sourceKey: string): Promise<string | null>;
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
    findMemberEmail: async (db, connectionId, sourceKey) =>
      (await importSourceRepository(db).findSourceAndMemberEmail(connectionId, sourceKey))?.email ??
      null,
    async addInvitedMember(tx, connectionId, account) {
      const sources = importSourceRepository(tx);
      const prior = await sources.findSourceAndMemberEmail(connectionId, account.sourceKey);
      if (!prior || prior.email === account.values.email) return null;
      await sources.upsertMember(prior.sourceId, account);
      return { previousEmail: prior.email };
    },
    removeMember: (tx, member) => importSourceRepository(tx).removeMember(member),
    findConnectionMembers: (db, members) =>
      importSourceRepository(db).findConnectionMembers(members),
    findLastScans: async (db) =>
      (await importSourceRepository(db).findAll()).flatMap(({ connectionId, readAt }) =>
        readAt === null ? [] : [{ connectionId, scannedAt: readAt }],
      ),
  };
}
