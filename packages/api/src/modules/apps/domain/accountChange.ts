import type { RuntimeKind } from "@broccoli-access/connector-contract";

import {
  type AccountAction,
  type AccountStatus,
  CONNECTOR_ERROR_CODES,
  type ConnectorErrorCode,
} from "../../../core/connectors";

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
  /** Null for a change in an app without a connection, which fails at once and is made by hand. */
  connectionId: string | null;
  action: AccountChangeAction;
  /** The member's id in the app, copied from the connection's record when the owner asked; null for an invite. */
  sourceKey: string | null;
  status: AccountChangeStatus;
  /** Each runtime tried, in order; `error` is null for the one that worked. */
  attempts: AccountChangeAttempt[];
  /** The last error; set exactly when `failed` or `done_by_hand`. */
  error: AccountChangeError | null;
  /** The user who asked. */
  requestedBy: string;
  requestedAt: Date;
  /** When it stopped `running`. */
  finishedAt: Date | null;
  startedFrom: AccountChangeStart;
  /** The person an offboarding or a provision is for; null when it started from the account. */
  employeeId: string | null;
}

/** Where the owner's click was: on the account's or invite's own row, on Offboard or on Provision. */
export const ACCOUNT_CHANGE_STARTS = ["account", "offboarding", "provision"] as const;

export type AccountChangeStart = (typeof ACCOUNT_CHANGE_STARTS)[number];

/** Where the owner's click was, and for Offboard or Provision, the person it is for. */
export type ChangeStart = Pick<AccountChange, "startedFrom" | "employeeId">;

/** The owner asked on the account's or the invite's own row. */
export const FROM_ACCOUNT: ChangeStart = { startedFrom: "account", employeeId: null };

/**
 * Where a change asked now started. Asked on its own row after the subject's latest change failed
 * with the same action, it is a Try again and keeps that change's start, so a provisioned change
 * stays Provision's, unless it was provisioned for another person than the subject's
 * (`subjectEmployeeId`), who has their email or account now. Asked from Provision, it is
 * Provision's.
 */
export function startOfChange(
  asked: ChangeStart & Pick<AccountChange, "action"> & { subjectEmployeeId: string | null },
  latest: Pick<AccountChange, "action" | "status" | "startedFrom" | "employeeId"> | null,
): ChangeStart {
  const retried =
    asked.startedFrom === "account" &&
    latest?.status === "failed" &&
    latest.action === asked.action &&
    (latest.employeeId === null || latest.employeeId === asked.subjectEmployeeId);
  const { startedFrom, employeeId } = retried ? latest : asked;
  return { startedFrom, employeeId };
}

/** A connector's error, or `no_connection`: the app has no connection to make the change through. */
export const ACCOUNT_CHANGE_ERRORS = [...CONNECTOR_ERROR_CODES, "no_connection"] as const;

export type AccountChangeError = (typeof ACCOUNT_CHANGE_ERRORS)[number];

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

/** What decides whether Disable, Enable or Remove is offered on an app account. */
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
  record: { isConnectionUser: boolean; confirmedDisabled?: boolean } | null;
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

/** A connector that can Disable requires a confirmed disabled member before Remove. */
export function offersRemove(facts: AccountChangeFacts): boolean {
  const { connection, record, status } = facts;
  return (
    !!connection?.removesAccounts &&
    canActOnMember(facts) &&
    (!connection.changesAccounts || (status === "suspended" && record?.confirmedDisabled === true))
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
