import type { RuntimeKind } from "@broccoli-access/connector-contract";

import type { AccountAction, AccountStatus, ConnectorErrorCode } from "../../../core/connectors";

/**
 * One Disable, Enable or Remove of one app account, or one Invite of an employee to an app, from the
 * owner's click to its result.
 */
export interface AccountChange {
  id: string;
  /** Null for an invite, and once a scan deleted the account; the change stays. */
  appAccountId: string | null;
  appId: string;
  /** The account's email, or the invited employee's, lowercased, copied when the owner asked. */
  email: string;
  /** The requested invite role, null for the default and for other changes. */
  role: string | null;
  connectionId: string;
  action: AccountChangeAction;
  /** The member's id in the app, copied from the connection's record when the owner asked; null for an invite. */
  sourceKey: string | null;
  status: AccountChangeStatus;
  /** Each runtime tried, in order; `error` is null for the one that worked. */
  attempts: AccountChangeAttempt[];
  /** The last error; set exactly when `failed` or `done_by_hand`. */
  error: ConnectorErrorCode | null;
  /** The user who asked. */
  requestedBy: string;
  requestedAt: Date;
  /** When it stopped `running`. */
  finishedAt: Date | null;
  startedFrom: AccountChangeStart;
  /** The person an offboarding is for; null when it started from the account. */
  employeeId: string | null;
}

/** Where the owner's click was: on the account's or invite's own row, or on Offboard. */
export const ACCOUNT_CHANGE_STARTS = ["account", "offboarding"] as const;

export type AccountChangeStart = (typeof ACCOUNT_CHANGE_STARTS)[number];

/** Disable (`suspend`), Enable (`reactivate`) Remove (`remove`) or Invite (`invite`). */
export type AccountChangeAction = AccountAction | "invite" | "remove";

/** `running` covers waiting for its turn too; `done_by_hand` follows a failure. */
export const ACCOUNT_CHANGE_STATUSES = ["running", "succeeded", "failed", "done_by_hand"] as const;

export type AccountChangeStatus = (typeof ACCOUNT_CHANGE_STATUSES)[number];

export interface AccountChangeAttempt {
  runtime: RuntimeKind;
  error: ConnectorErrorCode | null;
  at: Date;
}

/** What decides whether Disable or Enable is offered on an app account. */
export interface AccountChangeFacts {
  status: AccountStatus;
  /** The connection of the account's app; null without one. */
  connection: {
    status: "connected" | "reconnect";
    /** Whether its connector lists `suspend` and `reactivate`. */
    changesAccounts: boolean;
    removesAccounts?: boolean;
  } | null;
  /** The connection's record for the account's email from its last scan; null when it lists none. */
  record: { isConnectionUser: boolean } | null;
  /** Whether a change of the account is running. */
  changeRunning: boolean;
}

/**
 * Disable (`suspend`) on an active account or Enable (`reactivate`) on a suspended one, when its
 * app's connection can change it: connected, through a connector that suspends and reactivates,
 * listing the account, which is not the connection's own user, with no change running. Null
 * otherwise.
 */
export function offeredChange(facts: AccountChangeFacts): AccountAction | null {
  if (!facts.connection?.changesAccounts || !canActOnMember(facts)) return null;
  return facts.status === "active" ? "suspend" : "reactivate";
}

/** A disabled member can also be removed when its connector offers that action. */
export function offersRemove(facts: AccountChangeFacts): boolean {
  return (
    facts.status === "suspended" && !!facts.connection?.removesAccounts && canActOnMember(facts)
  );
}

/**
 * Whether the account's row shows Reconnect instead of Disable or Enable: it would offer one if
 * its app's connection were connected, but the connection is in `reconnect`.
 */
export function offersReconnect(facts: AccountChangeFacts): boolean {
  const { connection } = facts;
  if (connection?.status !== "reconnect") return false;
  const connected = { ...facts, connection: { ...connection, status: "connected" as const } };
  return offeredChange(connected) !== null || offersRemove(connected);
}

/** The status an action leaves the account in. */
export function statusAfter(action: AccountAction): AccountStatus {
  return action === "suspend" ? "suspended" : "active";
}

function canActOnMember({ connection, record, changeRunning }: AccountChangeFacts): boolean {
  return (
    connection?.status === "connected" &&
    record !== null &&
    !record.isConnectionUser &&
    !changeRunning
  );
}
