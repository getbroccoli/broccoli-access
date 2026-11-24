import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

/** A person's exception to their templates. The migration adds the cross-module foreign keys. */
export const employeeAppChoices = pgTable(
  "employee_app_choices",
  {
    employeeId: uuid("employee_id").notNull(),
    appId: uuid("app_id").notNull(),
    choice: text("choice", { enum: ["to_review", "added", "removed", "role_picked"] }).notNull(),
    role: text("role"),
  },
  (table) => [
    index("employee_app_choices_review_app")
      .on(table.appId)
      .where(sql`${table.choice} = 'to_review'`),
    primaryKey({ columns: [table.employeeId, table.appId] }),
    check(
      "employee_app_choices_choice",
      sql`${table.choice} in ('to_review','added','removed','role_picked')`,
    ),
    check(
      "employee_app_choices_role",
      sql`${table.choice} in ('added','role_picked') or ${table.role} is null`,
    ),
  ],
);
