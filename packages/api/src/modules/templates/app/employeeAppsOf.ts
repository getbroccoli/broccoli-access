import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { assignmentRepository } from "../db";
import { appsOfPerson, type Template } from "../domain";
import type { PersonAccess } from "../ports";
import { employeeTemplatesOf } from "./employeeTemplates";

interface EmployeeAppRead {
  db: Orm | Tx;
  apps: PersonAccess;
  ctx: SecurityContext;
  employeeIds: readonly string[];
  templates?: Template[][];
  invites?: Awaited<ReturnType<PersonAccess["readAppInvites"]>>;
}

/** Reads the facts used to compare expected and actual access on a person's apps. */
export async function employeeAppsOf(read: EmployeeAppRead) {
  const { db, apps, ctx, employeeIds } = read;
  if (!employeeIds.length) return [];
  const repo = assignmentRepository(db);
  const [templates, choices, accounts, invites] = await Promise.all([
    read.templates ?? employeeTemplatesOf(db, employeeIds),
    repo.choicesFor(employeeIds),
    apps.findEmployeeAccounts(db, employeeIds),
    read.invites ?? apps.readAppInvites(ctx, employeeIds, db),
  ]);
  const listedApps = await repo.listedApps([...new Set(accounts.map(({ appId }) => appId))]);
  const choicesByPerson = Map.groupBy(choices, (choice) => choice.employeeId);
  const accountsByPerson = Map.groupBy(accounts, (account) => account.employeeId);
  const invitesByPerson = Map.groupBy(invites, (invite) => invite.employeeId);
  return employeeIds.map((id, index) =>
    appsOfPerson({
      templates: templates[index]!,
      choices: choicesByPerson.get(id) ?? [],
      accounts: accountsByPerson.get(id) ?? [],
      invites: invitesByPerson.get(id) ?? [],
      listedApps,
    }),
  );
}
