import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { appConnections } from "./appConnectionsTable";
import { apps } from "./appsTable";

/** A pending invitation in a connected app, as the connection's last scan read it; never access. */
export const appInvitations = pgTable(
  "app_invitations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => appConnections.id),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id),
    /** Lowercased. */
    email: text("email").notNull(),
    /** As the app gives them; null when it does not. */
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** When a scan first saw it. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("app_invitations_connection_email_unique").on(table.connectionId, table.email),
  ],
);
