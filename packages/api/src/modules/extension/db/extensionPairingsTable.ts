import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../../../core/auth";

/** A user's Chrome, paired with this instance: one per user, replaced by pairing again. */
export const extensionPairings = pgTable("extension_pairings", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: text("user_id")
    .notNull()
    .unique("extension_pairings_user_id_unique")
    .references(() => user.id, { onDelete: "cascade" }),
  /** The hash of the token the extension holds; the token itself is never stored. */
  tokenHash: text("token_hash").notNull(),
  /** What Settings shows, such as "Chrome on macOS", as the extension reports it. */
  browser: text("browser").notNull(),
  pairedAt: timestamp("paired_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});
