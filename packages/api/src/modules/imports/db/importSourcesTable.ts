import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Where a later scan's records come from; no code writes it until the scan is built. */
export const importSources = pgTable(
  "import_sources",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text("kind", { enum: ["file"] }).notNull(),
    name: text("name").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", { enum: ["mapping", "mapped", "failed"] })
      .notNull()
      .default("mapped"),
    failure: text("failure", { enum: ["no_people_columns", "unavailable"] }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("import_sources_kind", sql`${table.kind} in ('file')`),
    check("import_sources_status", sql`${table.status} in ('mapping', 'mapped', 'failed')`),
    check(
      "import_sources_failure",
      sql`(${table.status} = 'failed') = (${table.failure} is not null)`,
    ),
  ],
);
