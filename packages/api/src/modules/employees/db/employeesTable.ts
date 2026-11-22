import { sql } from "drizzle-orm";
import { type AnyPgColumn, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../../../core/auth";
import { files } from "../../../core/files";

export const employees = pgTable(
  "employees",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull().unique("employees_email_unique"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** The employee owns this file and deletes it with the employee. */
    avatarFileId: uuid("avatar_file_id").references(() => files.id),
    /** The user who signs in as this employee, or null. */
    userId: text("user_id")
      .unique("employees_user_id_unique")
      .references(() => user.id, { onDelete: "set null" }),
    /** The employee the directory names as manager, or null. */
    // shortcut: deleting the manager clears this without a history line; fine until the copied
    // delete-employee action goes with the old People panel.
    managerId: uuid("manager_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    // Serves the list order, which is also the keyset of its cursor.
    index("employees_name_order_idx").on(
      sql`lower(${table.firstName})`,
      sql`lower(${table.lastName})`,
      table.id,
    ),
  ],
);
