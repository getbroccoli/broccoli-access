import type { Orm } from "../../src/core/db";
import { recordHistory } from "../../src/core/records/db";
import { appAccounts } from "../../src/modules/apps/db";
import { employees } from "../../src/modules/employees/db";
import { importSources, importRecords } from "../../src/modules/imports/db";

/** Stable raw reads to compare the complete persisted state before and after a scan. */
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
