import DataLoader from "dataloader";
import { type Orm, readSnapshot } from "../core/db";
import { perRequest } from "../core/graphql";
import type { SecurityContext } from "../core/security";
import type { AccountChangeService, AppUserService } from "./apps";
import type { TemplateService } from "./templates";

type Reads = Pick<TemplateService, "readEmployeeTemplates" | "readEmployeeApps"> &
  Pick<AccountChangeService, "readAppInvites" | "readChangeStates"> &
  Pick<AppUserService, "readUsersOfEmployees">;

/** Materialise the account controls and their template sources together, before GraphQL resolves their fields. */
export function createPersonPageReader(orm: Orm, reads: Reads) {
  return (ctx: SecurityContext, ids: readonly string[]) =>
    readSnapshot(orm, (db) => readPages(db, reads, ctx, ids));
}

async function readPages(db: Orm, reads: Reads, ctx: SecurityContext, ids: readonly string[]) {
  ctx.require("MANAGE_WORKSPACE");
  const templates = await reads.readEmployeeTemplates(ctx, ids, db);
  const invites = await reads.readAppInvites(ctx, ids, db);
  const accounts = await reads.readUsersOfEmployees(ctx, ids, db);
  const apps = await reads.readEmployeeApps(ctx, ids, { templates, invites }, db);
  const states = await reads.readChangeStates(
    ctx,
    accounts.map((account) => account.id),
    db,
  );
  const accountsByPerson = Map.groupBy(
    accounts.map((account) => ({ ...account, changeState: states.get(account.id)! })),
    (account) => account.employeeId,
  );
  const invitesByPerson = Map.groupBy(invites, (invite) => invite.employeeId);
  return ids.map((id, index) => ({
    templates: templates[index]!,
    personApps: apps[index]!,
    appAccounts: accountsByPerson.get(id) ?? [],
    appInvites: invitesByPerson.get(id) ?? [],
  }));
}

export function personPageLoader(read: ReturnType<typeof createPersonPageReader>) {
  return perRequest((ctx) => new DataLoader((ids: readonly string[]) => read(ctx.getActor(), ids)));
}
