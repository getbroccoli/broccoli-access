import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../../../core/auth";

/** The one Google Workspace user Broccoli Access created for itself; one row at most. */
export const integrationUser = pgTable(
  "integration_user",
  {
    id: boolean("id").primaryKey().default(true),
    /** The address the owner picked, in the directory's domain. */
    email: text("email").notNull(),
    /** The directory's id for it; the sync knows it by this id, never by its email. */
    googleUserId: text("google_user_id").notNull(),
    /** Its secrets as one JSON object, its password and its two-step secret once set up, encrypted. */
    encryptedSecrets: text("encrypted_secrets").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [check("integration_user_singleton", sql`${table.id}`)],
);
