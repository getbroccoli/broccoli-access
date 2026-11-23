import type { RuntimeKind } from "@broccoli-access/connector-contract";

import type { AccountAction, AccountStatus, ConnectorErrorCode } from "../../../core/connectors";

/** One Disable or Enable of one app account, from the owner's click to its result. */
export interface AccountChange {
  id: string;
  /** Null once a scan deleted the account; the change stays. */
  appAccountId: string | null;
  appId: string;
  /** The account's email, lowercased, copied when the owner asked. */
  email: string;
  connectionId: string;
  action: AccountAction;
  /** The member's id in the app, copied from the connection's record when the owner asked. */
  sourceKey: string;
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
}

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
export function offeredChange({
  status,
  connection,
  record,
  changeRunning,
}: AccountChangeFacts): AccountAction | null {
  const changeable =
    connection?.status === "connected" &&
    connection.changesAccounts &&
    record !== null &&
    !record.isConnectionUser &&
    !changeRunning;
  if (!changeable) {
    return null;
  }
  return status === "active" ? "suspend" : "reactivate";
}

/** The status an action leaves the account in. */
export function statusAfter(action: AccountAction): AccountStatus {
  return action === "suspend" ? "suspended" : "active";
}
