import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { IMPORT_SOURCE_KINDS, SCAN_FAILURES, SCAN_STATUSES } from "../domain";

/**
 * One place a scan reads from. `connection_id` references `app_connections`; the migration adds
 * that foreign key, since a module's tables never import another module's.
 */
export const importSources = pgTable(
  "import_sources",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text("kind", { enum: IMPORT_SOURCE_KINDS }).notNull(),
    connectionId: uuid("connection_id").unique("import_sources_connection_unique"),
    /** What the UI calls the source, such as the Google domain. */
    name: text("name").notNull(),
    status: text("status", { enum: SCAN_STATUSES }).notNull(),
    failure: text("failure", { enum: SCAN_FAILURES }),
    /** When the last successful scan finished; null before one. */
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("import_sources_kind", sql`${table.kind} in ('app_connection')`),
    check(
      "import_sources_connection",
      sql`(${table.kind} = 'app_connection') = (${table.connectionId} is not null)`,
    ),
    check("import_sources_status", sql`${table.status} in ('scanning', 'scanned', 'scan_failed')`),
    check(
      "import_sources_failure",
      sql`${table.failure} in ('authentication_failed', 'permission_missing', 'rate_limited', 'app_unavailable', 'unexpected_response')`,
    ),
    check(
      "import_sources_failure_when_failed",
      sql`(${table.status} = 'scan_failed') = (${table.failure} is not null)`,
    ),
  ],
);
