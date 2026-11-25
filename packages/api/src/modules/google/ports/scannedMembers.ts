import type { Orm, Tx } from "../../../core/db";

/** The directory member in the last scan of the connected workspace. */
export interface ScannedMembers {
  findMemberEmail(db: Orm | Tx, connectionId: string, sourceKey: string): Promise<string | null>;
  /** The members with one of `emails` that the last saved scan of one of `connectionIds` found. */
  findConnectionMembers(
    db: Orm | Tx,
    members: { connectionIds: readonly string[]; emails: readonly string[] },
  ): Promise<{ sourceKey: string; status: "active" | "suspended" }[]>;
}
