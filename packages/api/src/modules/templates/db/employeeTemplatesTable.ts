import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { user } from "../../../core/auth";
import { templates } from "./templatesTable";

/**
 * A template assigned to a person. `employee_id` references `employees`; the migration adds that
 * foreign key, since a module's tables never import another module's.
 */
export const employeeTemplates = pgTable(
  "employee_templates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id").notNull(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by")
      .notNull()
      .references(() => user.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("employee_templates_template_id_id").on(table.templateId, table.id),
    unique("employee_templates_employee_template").on(table.employeeId, table.templateId),
  ],
);
