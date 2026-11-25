import DataLoader from "dataloader";
import { type Orm, readSnapshot, type Tx } from "../core/db";
import { perRequest } from "../core/graphql";
import type { SecurityContext } from "../core/security";
import type {
  AccountChangeService,
  AppUserService,
  PersonPageScope,
  ProvisionService,
} from "./apps";
import type { TemplateService } from "./templates";

type Reads = Pick<TemplateService, "readEmployeeTemplates" | "readEmployeeApps"> &
  Pick<AccountChangeService, "readEmployeeInviteRows" | "readChangeStates"> &
  Pick<AppUserService, "readUsersOfEmployees">;

/**
 * Materialise the account controls, their template sources and what Provision would do together,
 * before GraphQL resolves their fields.
 */
export function createPersonPageReader(
  orm: Orm,
  reads: Reads & Pick<ProvisionService, "readProvisionSteps">,
) {
  return (ctx: SecurityContext, ids: readonly string[], scope?: PersonPageScope) =>
    readSnapshot(orm, async (db) => {
      const pages = await readPersonPages(db, reads, ctx, ids, scope);
      const steps = await reads.readProvisionSteps(ctx, pages, db);
      return pages.map((page, index) => ({ ...page, provisionSteps: steps[index]! }));
    });
}

/** The people's templates, apps, accounts and invite rows, read through `db`, one page per id. */
export async function readPersonPages(
  db: Orm | Tx,
  reads: Reads,
  ctx: SecurityContext,
  ids: readonly string[],
  scope?: PersonPageScope,
) {
  ctx.require("MANAGE_WORKSPACE");
  const templates = await reads.readEmployeeTemplates(ctx, ids, db);
  const { rows: invites, activeInDirectory } = await reads.readEmployeeInviteRows(
    ctx,
    ids,
    db,
    scope,
  );
  const accounts = await reads.readUsersOfEmployees(ctx, ids, db, scope?.appIds);
  const apps = await reads.readEmployeeApps(
    ctx,
    ids,
    { templates, invites, appIds: scope?.appIds },
    db,
  );
  const states = await reads.readChangeStates(
    ctx,
    accounts.map((account) => account.id),
    db,
    scope?.connectors,
  );
  const accountsByPerson = Map.groupBy(
    accounts.map((account) => ({ ...account, changeState: states.get(account.id)! })),
    (account) => account.employeeId,
  );
  const invitesByPerson = Map.groupBy(invites, (invite) => invite.employeeId);
  return ids.map((id, index) => ({
    activeInDirectory: activeInDirectory.has(id),
    templates: templates[index]!,
    personApps: apps[index]!,
    appAccounts: accountsByPerson.get(id) ?? [],
    appInvites: invitesByPerson.get(id) ?? [],
  }));
}

export function personPageLoader(read: ReturnType<typeof createPersonPageReader>) {
  return perRequest((ctx) => new DataLoader((ids: readonly string[]) => read(ctx.getActor(), ids)));
}

/** Differences needs the people and apps on its missing rows only. */
export function differencePageLoader(
  read: ReturnType<typeof createPersonPageReader>,
  readConnectors: () => Promise<PersonPageScope["connectors"]>,
) {
  type Pair = { employeeId: string; appId: string };
  type Page = Awaited<ReturnType<typeof read>>[number];
  return perRequest(
    (ctx) =>
      new DataLoader<Pair, Page, string>(
        async (pairs) => {
          const ids = [...new Set(pairs.map(({ employeeId }) => employeeId))];
          const pages = await read(ctx.getActor(), ids, {
            appIds: [...new Set(pairs.map(({ appId }) => appId))],
            connectors: await readConnectors(),
          });
          const byPerson = new Map(ids.map((id, index) => [id, pages[index]!]));
          return pairs.map(({ employeeId }) => byPerson.get(employeeId)!);
        },
        { cacheKeyFn: ({ appId, employeeId }) => employeeId + "/" + appId },
      ),
  );
}
