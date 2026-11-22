import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { jsonb } from "../../../core/db";
import { files } from "../../../core/files";
import { importSources } from "./importSourcesTable";

/**
 * Every account a source saw in its last scan, one row each. `values` follow the schema of `type`
 * at `type_version`; `raw` keeps the source's JSON as it came.
 */
export const importRecords = pgTable(
  "import_records",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => importSources.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["app_account"] }).notNull(),
    typeVersion: integer("type_version").notNull(),
    /** The source's own id for the account, such as the Google user id. */
    sourceKey: text("source_key").notNull(),
    raw: jsonb("raw").notNull(),
    values: jsonb("values").notNull(),
    /** Unused in circle 1: where the person's photo can be downloaded. */
    photoUrl: text("photo_url"),
    /** Unused in circle 1: the stored copy of the photo at `photo_url`. */
    photoFileId: uuid("photo_file_id").references(() => files.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("import_records_source_record").on(table.sourceId, table.type, table.sourceKey),
    check("import_records_type", sql`${table.type} in ('app_account')`),
  ],
);
