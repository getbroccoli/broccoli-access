import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { jsonb } from "../../../core/db";
import { apps } from "./appsTable";

/** One connected app: its connector's settings and encrypted secrets. */
export const appConnections = pgTable("app_connections", {
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
});
