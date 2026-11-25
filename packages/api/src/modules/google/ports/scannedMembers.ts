import type { Orm, Tx } from "../../../core/db";

/** The directory member in the last scan of the connected workspace. */
export interface ScannedMembers {
  findMemberEmail(db: Orm | Tx, connectionId: string, sourceKey: string): Promise<string | null>;
}
