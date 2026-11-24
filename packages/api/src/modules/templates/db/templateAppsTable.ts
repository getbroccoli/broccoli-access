import { sql } from "drizzle-orm";
import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { templates } from "./templatesTable";

/**
 * One app in one template. `app_id` references `apps`; the migration adds that foreign key, since
 * a module's tables never import another module's.
 */
export const templateApps = pgTable(
  "template_apps",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    appId: uuid("app_id").notNull(),
    /** A role key of the app's connector; null for the app's default. */
    role: text("role"),
  },
  (table) => [unique("template_apps_template_app").on(table.templateId, table.appId)],
);
