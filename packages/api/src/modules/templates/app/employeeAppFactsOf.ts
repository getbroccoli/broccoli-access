import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { assignmentRepository } from "../db";
import type { PersonAppFacts, Template } from "../domain";
import type { PersonAccess } from "../ports";
import { employeeTemplatesOf } from "./employeeTemplates";

interface EmployeeAppRead {
  db: Orm | Tx;
  apps: PersonAccess;
  ctx: SecurityContext;
  employeeIds: readonly string[];
  templates?: Template[][];
  appIds?: readonly string[];
  invites?: Awaited<ReturnType<PersonAccess["readAppInvites"]>>;
}

/** Reads the facts used to compare expected and actual access on a person's apps. */
export async function employeeAppFactsOf(read: EmployeeAppRead): Promise<EmployeeAppFacts[]> {
  const { db, apps, ctx, employeeIds } = read;
  if (!employeeIds.length) return [];
  const repo = assignmentRepository(db);
  const [templates, choices, accounts, invites] = await Promise.all([
    read.templates ?? employeeTemplatesOf(db, employeeIds),
    repo.choicesFor(employeeIds, read.appIds),
    apps.findEmployeeAccounts(db, employeeIds, read.appIds),
    read.invites ?? apps.readAppInvites(ctx, employeeIds, db),
  ]);
  const [listedApps, connectedApps] = await Promise.all([
    repo.listedApps([...new Set(accounts.map(({ appId }) => appId))]),
    apps.connectedAppIds(db, read.appIds ?? expectedAppIds(templates, choices)),
  ]);
  const choicesByPerson = Map.groupBy(choices, (choice) => choice.employeeId);
  const accountsByPerson = Map.groupBy(accounts, (account) => account.employeeId);
  const invitesByPerson = Map.groupBy(invites, (invite) => invite.employeeId);
  const scoped = read.appIds && new Set(read.appIds);
  return employeeIds.map((id, index) => ({
    templates: scoped
      ? templates[index]!.map((template) => ({
          ...template,
          apps: template.apps.filter(({ appId }) => scoped.has(appId)),
        }))
      : templates[index]!,
    choices: choicesByPerson.get(id) ?? [],
    accounts: accountsByPerson.get(id) ?? [],
    invites: invitesByPerson.get(id) ?? [],
    listedApps,
    connectedApps,
  }));
}

/** The apps any of these templates or choices may give, each once. */
function expectedAppIds(templates: Template[][], choices: readonly { appId: string }[]) {
  const ids = new Set(choices.map(({ appId }) => appId));
  for (const template of new Map(templates.flat().map((one) => [one.id, one])).values()) {
    for (const { appId } of template.apps) ids.add(appId);
  }
  return [...ids];
}

type EmployeeAppFacts = Omit<PersonAppFacts, "accounts"> & {
  accounts: Awaited<ReturnType<PersonAccess["findEmployeeAccounts"]>>;
};
