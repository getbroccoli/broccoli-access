import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { APP_STATUSES } from "../domain";

/** Every app a source found, and the connected apps themselves. */
export const apps = pgTable(
  "apps",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull(),
    /** Null when unknown. */
    domain: text("domain"),
    /** The built-in catalog's key; null for an app outside the catalog. */
    catalogKey: text("catalog_key").unique("apps_catalog_key_unique"),
    /** How sources name the app, prefixed by source, such as `google:<client id>`. */
    externalIds: text("external_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    status: text("status", { enum: APP_STATUSES }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("apps_status", sql`${table.status} in ('discovered', 'approved', 'ignored')`)],
);
