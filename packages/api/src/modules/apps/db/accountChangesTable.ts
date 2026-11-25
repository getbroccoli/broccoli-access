import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "../../../core/auth";
import { CONNECTOR_ERROR_CODES } from "../../../core/connectors";
import { jsonb } from "../../../core/db";
import {
  ACCOUNT_CHANGE_STARTS,
  ACCOUNT_CHANGE_STATUSES,
  type AccountChangeAttempt,
} from "../domain";
import { appAccounts } from "./appAccountsTable";
import { appConnections } from "./appConnectionsTable";
import { apps } from "./appsTable";

/** One Disable, Enable or Remove of one app account, or one Invite of an employee to an app, from the owner's click to its result. */
export const accountChanges = pgTable(
  "account_changes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** Null for an invite; turns null when a scan deletes the account, and the change stays. */
    appAccountId: uuid("app_account_id").references(() => appAccounts.id, {
      onDelete: "set null",
    }),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id),
    /** The account's email, or the invited employee's, lowercased, copied when the owner asks. */
    email: text("email").notNull(),
    role: text("role"),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => appConnections.id),
    action: text("action", { enum: ["suspend", "reactivate", "invite", "remove"] }).notNull(),
    /** The member's id in the app, copied from the connection's import record; null for an invite. */
    sourceKey: text("source_key"),
    status: text("status", { enum: ACCOUNT_CHANGE_STATUSES }).notNull(),
    /** Each runtime tried, in order, as `{ runtime, error, at }`. */
    attempts: jsonb("attempts").$type<StoredAttempt[]>().notNull(),
    error: text("error", { enum: CONNECTOR_ERROR_CODES }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    startedFrom: text("started_from", { enum: ACCOUNT_CHANGE_STARTS }).notNull().default("account"),
    /** The employee an offboarding is for; its foreign key is in the migration, as employees are another module's. */
    employeeId: uuid("employee_id"),
  },
  (table) => [
    // One at a time: an app account has at most one running change.
    uniqueIndex("account_changes_one_running")
      .on(table.appAccountId)
      .where(sql`${table.status} = 'running'`),
    // One at a time: an email has at most one running invite per connection.
    uniqueIndex("account_changes_one_running_invite")
      .on(table.connectionId, table.email)
      .where(sql`${table.status} = 'running' and ${table.action} = 'invite'`),
    index("account_changes_app_account").on(table.appAccountId, table.requestedAt),
    check(
      "account_changes_action",
      sql`${table.action} in ('suspend', 'reactivate', 'invite', 'remove')`,
    ),
    check(
      "account_changes_status",
      sql`${table.status} in ('running', 'succeeded', 'failed', 'done_by_hand')`,
    ),
    check("account_changes_started_from", sql`${table.startedFrom} in ('account', 'offboarding')`),
    index("account_changes_offboarded_employee")
      .on(table.employeeId, table.requestedAt)
      .where(sql`${table.startedFrom} = 'offboarding'`),
    check(
      "account_changes_error",
      sql`${table.error} in ('authentication_failed', 'permission_missing', 'rate_limited', 'app_unavailable', 'unexpected_response', 'blocked_by_check', 'account_not_found', 'wrong_workspace', 'not_allowed', 'owner_browser_lost')`,
    ),
    check(
      "account_changes_error_when_failed",
      sql`(${table.status} in ('failed', 'done_by_hand')) = (${table.error} is not null)`,
    ),
    check(
      "account_changes_finished_when_not_running",
      sql`(${table.status} = 'running') = (${table.finishedAt} is null)`,
    ),
  ],
);

/** An attempt as JSON stores it, its moment as an ISO date-time. */
export type StoredAttempt = Omit<AccountChangeAttempt, "at"> & { at: string };
