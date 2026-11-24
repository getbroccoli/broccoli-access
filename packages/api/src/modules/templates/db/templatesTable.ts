import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** A named list of apps that the owner assigns to people. */
export const templates = pgTable(
  "templates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Ignoring case, so "Engineer" and "engineer" are never two templates.
  (table) => [uniqueIndex("templates_name_unique").on(sql`lower(${table.name})`)],
);
