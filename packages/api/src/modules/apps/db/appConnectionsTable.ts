import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../../../core/auth";
import { APP_SESSION_SOURCES } from "../../../core/connectors";
import { jsonb } from "../../../core/db";
import { APP_CONNECTION_STATUSES, RECONNECT_CAUSES } from "../domain";
import { apps } from "./appsTable";

/** One connected app: its connector's settings and encrypted secrets. */
export const appConnections = pgTable(
  "app_connections",
  {
    /** Read before the insert: it is the associated data that encrypts `encrypted_secrets`. */
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** The connector module's key, such as `google_workspace`; checked in code. */
    connector: text("connector").notNull().unique("app_connections_connector_unique"),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id),
    /** What the connector needs and Settings shows; never a secret. */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
    /** The connector's secrets as one JSON object, encrypted with the connection's id as associated data. */
    encryptedSecrets: text("encrypted_secrets").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", { enum: APP_CONNECTION_STATUSES }).notNull().default("connected"),
    /** The connector error that turned it to `reconnect`; set exactly then. */
    reconnectCause: text("reconnect_cause", { enum: RECONNECT_CAUSES }),
    /** When and by whom the connector's notice was accepted; set exactly for a connector with one. */
    noticeAcceptedAt: timestamp("notice_accepted_at", { withTimezone: true }),
    noticeAcceptedBy: text("notice_accepted_by").references(() => user.id),
    /** Who made its app session; set exactly for a connection with one. */
    sessionFrom: text("session_from", { enum: APP_SESSION_SOURCES }),
  },
  (table) => [
    check("app_connections_status", sql`${table.status} in ('connected', 'reconnect')`),
    check(
      "app_connections_reconnect_cause",
      sql`${table.reconnectCause} in ('authentication_failed', 'permission_missing', 'wrong_workspace')`,
    ),
    check(
      "app_connections_reconnect_cause_when_reconnect",
      sql`(${table.status} = 'reconnect') = (${table.reconnectCause} is not null)`,
    ),
    check(
      "app_connections_notice_accepted",
      sql`(${table.noticeAcceptedAt} is null) = (${table.noticeAcceptedBy} is null)`,
    ),
    check(
      "app_connections_session_from",
      sql`${table.sessionFrom} in ('extension', 'server_sign_in')`,
    ),
  ],
);
