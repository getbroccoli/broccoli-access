import type { AccountStatus } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";

/** What the scan needs from the apps module: connections, their secrets, and accounts. */
export interface ScannedApps {
  readConnectionById(
    db: Orm | Tx,
    connectionId: string,
  ): Promise<{
    id: string;
    connector: string;
    appId: string;
    settings: Record<string, unknown>;
  } | null>;
  readSecrets(db: Orm | Tx, connectionId: string): Promise<Record<string, string> | null>;
  /** Makes the accounts `findingKind` saw exactly `accounts`, with history, joining `tx`. */
  syncAccounts(
    ctx: SecurityContext,
    tx: Tx,
    sync: {
      findingKind: string;
      accounts: readonly {
        appId: string;
        email: string;
        status: AccountStatus;
        employeeId: string | null;
      }[];
      cause: HistoryAppend["cause"];
    },
  ): Promise<void>;
  countAccounts(db: Orm | Tx, appId: string): Promise<{ people: number; suspended: number }>;
}
