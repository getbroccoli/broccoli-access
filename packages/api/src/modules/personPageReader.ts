import DataLoader from "dataloader";
import { type Orm, readSnapshot, type Tx } from "../core/db";
import { perRequest } from "../core/graphql";
import type { SecurityContext } from "../core/security";
import type { AccountChangeService, AppUserService, ProvisionService } from "./apps";
import type { TemplateService } from "./templates";

type Reads = Pick<TemplateService, "readEmployeeTemplates" | "readEmployeeApps"> &
  Pick<AccountChangeService, "readAppInvites" | "readChangeStates"> &
  Pick<AppUserService, "readUsersOfEmployees">;

/**
 * Materialise the account controls, their template sources and what Provision would do together,
 * before GraphQL resolves their fields.
 */
export function createPersonPageReader(
  orm: Orm,
  reads: Reads & Pick<ProvisionService, "readProvisionSteps">,
) {
  return (ctx: SecurityContext, ids: readonly string[]) =>
    readSnapshot(orm, async (db) => {
      const pages = await readPersonPages(db, reads, ctx, ids);
      const steps = await reads.readProvisionSteps(ctx, ids, pages, db);
      return pages.map((page, index) => ({ ...page, provisionSteps: steps[index]! }));
    });
}

/** The people's templates, apps, accounts and invite rows, read through `db`, one page per id. */
export async function readPersonPages(
  db: Orm | Tx,
  reads: Reads,
  ctx: SecurityContext,
  ids: readonly string[],
) {
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
