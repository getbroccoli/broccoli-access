import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { recordHistory } from "../../src/core/records/db";
import { apps, appAccounts } from "../../src/modules/apps/db";
import { employees } from "../../src/modules/employees/db";
import { importSources, importRecords } from "../../src/modules/imports/db";
import { employeeTemplates, templateApps, templates } from "../../src/modules/templates/db";

/** Stable raw reads to compare the complete persisted state before and after a scan. */
export function storedApps(orm: Orm) {
  return orm.select().from(apps).orderBy(apps.name, apps.id);
}
export function storedEmployees(orm: Orm) {
  return orm.select().from(employees).orderBy(employees.email);
}
export function storedAppAccounts(orm: Orm) {
  return orm.select().from(appAccounts).orderBy(appAccounts.email, appAccounts.appId);
}
export function storedImportSources(orm: Orm) {
  return orm.select().from(importSources).orderBy(importSources.id);
}
export function storedImportRecords(orm: Orm) {
  return orm.select().from(importRecords).orderBy(importRecords.sourceKey);
}
export function storedRecordHistory(orm: Orm) {
  return orm.select().from(recordHistory).orderBy(recordHistory.id);
}

export function storedTemplates(orm: Orm) {
  return orm.select().from(templates).orderBy(templates.id);
}
export function storedTemplateApps(orm: Orm) {
  return orm.select().from(templateApps).orderBy(templateApps.id);
}
export function storedEmployeeTemplates(orm: Orm) {
  return orm.select().from(employeeTemplates).orderBy(employeeTemplates.id);
}

/** Whether an account can take its employee foreign-key lock without waiting. */
export async function canReferenceEmployee(orm: Orm, id: string): Promise<boolean> {
  const rows = await orm
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, id))
    .for("key share", { skipLocked: true });
  return rows.length === 1;
}
