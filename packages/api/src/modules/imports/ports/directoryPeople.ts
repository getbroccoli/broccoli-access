import type { AccountPhoto } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";

/** What the scan needs from the employees module: employees kept in step with the directory. */
export interface DirectoryPeople {
  /**
   * Creates and updates the listed people's employees, with history; returns their ids by email.
   * A photo replaces the employee's avatar, null clears it, and a photo left out keeps it.
   */
  syncDirectoryPeople(
    ctx: SecurityContext,
    tx: Tx,
    people: readonly {
      email: string;
      firstName: string;
      lastName: string;
      managerEmail: string | null;
      photo?: AccountPhoto | null;
    }[],
    cause: HistoryAppend["cause"],
  ): Promise<Map<string, string>>;
  /** The employees with these lowercased emails, their ids by email; an email nobody has is left out. */
  findEmployeeIdsByEmail(
    ctx: SecurityContext,
    db: Orm | Tx,
    emails: readonly string[],
  ): Promise<Map<string, string>>;
  /** The emails, among these lowercased ones, whose employee has a photo. */
  findEmailsWithPhoto(
    ctx: SecurityContext,
    db: Orm | Tx,
    emails: readonly string[],
  ): Promise<Set<string>>;
}
