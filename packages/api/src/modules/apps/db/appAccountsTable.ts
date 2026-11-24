import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { ACCOUNT_STATUSES } from "../../../core/connectors";
import { apps } from "./appsTable";

/**
 * One person's account in one app. `employee_id` references `employees`; the migration adds that
 * foreign key, since a module's tables never import another module's.
 */
export const appAccounts = pgTable(
  "app_accounts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id),
    /** Lowercased. */
    email: text("email").notNull(),
    /** The employee matched by email or chosen by the owner. */
    employeeId: uuid("employee_id"),
    employeeLinkedBy: text("employee_linked_by", { enum: ["email", "owner"] }),
    kind: text("kind", { enum: ["personal", "service", "external"] })
      .notNull()
      .default("personal"),
    note: text("note"),
    status: text("status", { enum: ACCOUNT_STATUSES }).notNull(),
    /** The finding kinds whose last scan saw the account, such as `google_directory`. */
    foundVia: text("found_via").array().notNull(),
    /** When the person granted access, from the source's log; null when the log lacks it. */
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    /** Set only when the grant is older than the log: the earliest moment the log covered. */
    grantedBefore: timestamp("granted_before", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("app_accounts_employee_app").on(table.employeeId, table.appId),
    unique("app_accounts_app_email").on(table.appId, table.email),
    check("app_accounts_kind", sql`${table.kind} in ('personal', 'service', 'external')`),
    check(
      "app_accounts_employee_link",
      sql`(${table.employeeId} is null) = (${table.employeeLinkedBy} is null)
      and (${table.employeeLinkedBy} is null or (${table.kind} = 'personal' and ${table.employeeLinkedBy} in ('email','owner')))`,
    ),
    check("app_accounts_note", sql`${table.kind} <> 'personal' or ${table.note} is null`),
    check("app_accounts_status", sql`${table.status} in ('active', 'suspended')`),
  ],
);
