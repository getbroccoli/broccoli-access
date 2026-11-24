import type { AccountStatus, ConnectorErrorCode } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";

/** What the scan needs from the apps module: connections, their secrets, apps and accounts. */
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
  /** A single stored version, so its settings choose the protocol for these secrets. */
  readConnectionWithSecrets(
    db: Orm | Tx,
    connectionId: string,
  ): Promise<{
    connection: { id: string; connector: string; appId: string; settings: Record<string, unknown> };
    secrets: Record<string, unknown>;
  } | null>;
  /** Holds off other account syncs and connects until `tx` ends; a scan's save takes it first. */
  holdAccountSyncs(ctx: SecurityContext, tx: Tx): Promise<void>;
  /**
   * Replaces the settings or secrets `update` carries, joining `tx`; new settings add history.
   * Saves nothing once the stored secrets are no longer `replacing`; returns whether it saved.
   */
  changeConnection(
    ctx: SecurityContext,
    tx: Tx,
    connectionId: string,
    update: {
      settings?: Record<string, unknown>;
      secrets?: Record<string, unknown>;
      replacing?: Record<string, unknown>;
    },
  ): Promise<boolean>;
  /**
   * Turns the connection to Reconnect when `error` needs it and the connection still holds
   * `secretsUsed`, joining `tx`, with a history line whose ref is `ref`; returns whether it turned.
   */
  turnToReconnect(
    ctx: SecurityContext,
    tx: Tx,
    failure: {
      connectionId: string;
      error: ConnectorErrorCode;
      ref: string;
      secretsUsed: Record<string, unknown> | null;
    },
  ): Promise<boolean>;
  /**
   * Makes the accounts `findingKind` saw exactly `accounts`, with history, joining `tx`; an account
   * in an app that another connection than `connectionId` reads keeps its status.
   */
  syncAccounts(
    ctx: SecurityContext,
    tx: Tx,
    sync: {
      findingKind: string;
      /** The scanned connection. */
      connectionId: string;
      accounts: readonly {
        appId: string;
        email: string;
        status: AccountStatus;
        employeeId: string | null;
        grantedAt: Date | null;
        grantedBefore: Date | null;
      }[];
      cause: HistoryAppend["cause"];
      /** When the scan began reading; an account changed since keeps its status. */
      readStartedAt: Date;
    },
  ): Promise<void>;
  /** Matches found apps to apps, creating the missing ones; returns app ids by external id. */
  matchFoundApps(
    ctx: SecurityContext,
    tx: Tx,
    match: {
      found: readonly { externalId: string; name: string }[];
      cause: HistoryAppend["cause"];
    },
  ): Promise<Map<string, string>>;
  countAccounts(db: Orm | Tx, appId: string): Promise<{ people: number; suspended: number }>;
  countAppsFoundVia(db: Orm | Tx, findingKind: string): Promise<number>;
}
