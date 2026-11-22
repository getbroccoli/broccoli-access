import type { Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";

/** What the scan needs from the employees module: employees kept in step with the directory. */
export interface DirectoryPeople {
  /** Creates and updates the listed people's employees, with history; returns their ids by email. */
  syncDirectoryPeople(
    ctx: SecurityContext,
    tx: Tx,
    people: readonly {
      email: string;
      firstName: string;
      lastName: string;
      managerEmail: string | null;
    }[],
    cause: HistoryAppend["cause"],
  ): Promise<Map<string, string>>;
}
