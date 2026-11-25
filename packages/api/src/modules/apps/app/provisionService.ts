import { ApplicationError } from "../../../core/applicationError";
import type { Connector } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import {
  accountChangeRepository,
  appAccountRepository,
  appConnectionRepository,
  appRepository,
} from "../db";
import {
  type AccountChange,
  type ChangeStart,
  type ProvisionAction,
  provisionActionOf,
} from "../domain";
import type { PersonPage, ReadPersonPages } from "../ports";
import { type AccountChangeDependencies } from "./accountChangeService";
import { type ChangingConnectors, changingConnectors } from "./accountFacts";
import { askForInvite } from "./appInvite";
import { askForChange } from "./askForChange";
import { findEmployeesInDirectory } from "./directory";
import { loggingRefusal } from "./loggingRefusal";
import { type AppProvisionResult, provisionSelectedApp } from "./provisionSelectedApp";

/** Provision: a person gets every app they are missing, in one step. */
export interface ProvisionService {
  /**
   * What Provision offers now for each of the people, in the order of `employeeIds`: an action for
   * each of their missing apps it can give (`provisionActionOf`); a role to pick can still refuse
   * them. Needs MANAGE_WORKSPACE.
   */
  readProvisionSteps: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
    pages: readonly PersonPage[],
    db?: Orm | Tx,
  ) => Promise<ProvisionStep[][]>;
  /**
   * Provisions the employee with the apps the owner confirmed (`appIds`): in one transaction writes
   * one change, started from Provision, for each of those apps' steps offered now: an Invite or an
   * Enable, queued like the owner's own, and for an app without a connection an invite that fails at
   * once with `no_connection`, for the owner to make by hand. An app without a step now gets
   * nothing. Returns the changes it wrote. Needs MANAGE_WORKSPACE and a signed-in user; refuses an
   * unknown employee with NOT_FOUND, and a confirmed missing app whose templates disagree on its
   * role, or whose invite role its app no longer offers, with CONFLICT.
   */
  provisionEmployee: (
    ctx: SecurityContext,
    input: { employeeId: string; appIds: readonly string[] },
  ) => Promise<AccountChange[]>;
  /** Provisions one app for the confirmed people and reports each expected refusal. */
  provisionApp: (
    ctx: SecurityContext,
    input: { appId: string; employeeIds: readonly string[] },
  ) => Promise<AppProvisionResult>;
}

/** What Provision does for one app of a person. */
export interface ProvisionStep {
  appId: string;
  action: ProvisionAction;
}

export type ProvisionDependencies = AccountChangeDependencies & {
  /** The people's pages, which hold their missing apps beside their accounts and invite rows. */
  readPersonPages: ReadPersonPages;
};

export function createProvisionService(dependencies: ProvisionDependencies): ProvisionService {
  return {
    readProvisionSteps: (ctx, employeeIds, pages, db = dependencies.orm) =>
      readProvisionSteps(dependencies, ctx, { employeeIds, pages, db }),
    provisionEmployee: (ctx, input) => provisionOne(dependencies, ctx, input),
    provisionApp(ctx, input) {
      let listed: Promise<readonly Connector[]> | undefined;
      const connectors = { list: () => (listed ??= dependencies.connectors.list()) };
      return provisionSelectedApp(
        ctx,
        input,
        (ctx, person) => provisionOne({ ...dependencies, connectors }, ctx, person, true),
        dependencies.logger,
      );
    },
  };
}

async function provisionOne(
  dependencies: ProvisionDependencies,
  ctx: SecurityContext,
  { employeeId, appIds }: { employeeId: string; appIds: readonly string[] },
  reportBlocked = false,
): Promise<AccountChange[]> {
  const { logger, connectors } = dependencies;
  const refusal = { message: "Provision refused", ids: { employeeId: parseUuid(employeeId) } };
  const changes = await loggingRefusal(logger, refusal, async () => {
    ctx.require("MANAGE_WORKSPACE");
    if (!ctx.user) {
      throw new ApplicationError("FORBIDDEN", "Only a signed-in user can provision a person.");
    }
    const [employee] = refusal.ids.employeeId
      ? await dependencies.employees.readEmployees(ctx, [refusal.ids.employeeId])
      : [];
    if (!employee) {
      throw new ApplicationError("NOT_FOUND", NO_EMPLOYEE);
    }
    // Read before the transaction: the container's list may take a while to answer.
    return queueProvision(dependencies, {
      ctx,
      employee,
      appIds: appIds.flatMap((appId) => parseUuid(appId) ?? []).toSorted(),
      requestedBy: ctx.user.userId,
      connectors: await connectors.list(),
      changing: await changingConnectors(connectors),
      reportBlocked,
      start: { startedFrom: "provision", employeeId: employee.id },
    });
  });
  logger.info(
    { ...refusal.ids, changeIds: changes.map((change) => change.id) },
    "Provision requested",
  );
  return changes;
}

const NO_EMPLOYEE = "No employee has this id.";

const PICK_ROLE_FIRST =
  "The templates of a missing app disagree on its role: its role is picked before this person is provisioned.";

interface ProvisionRequest {
  ctx: SecurityContext;
  employee: { id: string; email: string };
  /** The apps the owner confirmed, sorted, so every Provision locks them in one order. */
  appIds: readonly string[];
  requestedBy: string;
  connectors: readonly Connector[];
  /** The connectors that change accounts. */
  changing: ChangingConnectors;
  reportBlocked: boolean;
  start: ChangeStart;
}

/** Wait for a template edit outside the account sync lock, then read the person's steps again. */
async function queueProvision(
  dependencies: ProvisionDependencies,
  request: ProvisionRequest,
): Promise<AccountChange[]> {
  for (;;) {
    const changes = await dependencies.transact((tx) => startSteps(dependencies, tx, request));
    if (changes) return changes;
    await dependencies.transact((tx) => appRepository(tx).lockForReview(request.appIds));
  }
}

/** Writes a change for each confirmed app's step offered now, or returns null if a template edit holds one of the apps. */
async function startSteps(
  dependencies: ProvisionDependencies,
  tx: Tx,
  request: ProvisionRequest,
): Promise<AccountChange[] | null> {
  const { appIds } = request;
  // The lock scans take first, as an invite's own transaction does.
  await appAccountRepository(tx).lockForSync();
  for (const appId of appIds) {
    if (!(await appRepository(tx).tryLockForReview(appId))) return null;
  }
  // Read again under the locks: the address a by-hand invite records is theirs now.
  const [employee] = await dependencies.employees.readEmployees(
    request.ctx,
    [request.employee.id],
    tx,
  );
  if (!employee) throw new ApplicationError("NOT_FOUND", NO_EMPLOYEE);
  request = { ...request, employee };
  const { page, steps } = await readSteps(dependencies, request, tx);
  const confirmed = page.personApps.filter(({ appId }) => appIds.includes(appId));
  if (confirmed.some((app) => app.state === "missing" && app.roleConflict)) {
    throw new ApplicationError("CONFLICT", PICK_ROLE_FIRST);
  }
  const chosenSteps = steps.filter(({ appId }) => appIds.includes(appId));
  if (
    request.reportBlocked &&
    !chosenSteps.length &&
    confirmed.some(({ appId, state }) => state === "missing" && !hasRunningStep(page, appId))
  )
    throw new ApplicationError("CONFLICT", "This app cannot be provisioned for this person now.");
  const changes: AccountChange[] = [];
  // One after the other, in the order the connections' queues keep.
  for (const step of chosenSteps) {
    changes.push(await startStep(dependencies, tx, request, { step, page }));
  }
  return changes;
}

function hasRunningStep(page: PersonPage, appId: string) {
  return (
    page.appInvites.some((row) => row.appId === appId && row.latestInvite?.status === "running") ||
    page.appAccounts.some((row) => {
      const change = row.changeState?.latestChange;
      return row.appId === appId && change?.action === "reactivate" && change.status === "running";
    })
  );
}

/** Writes the step's change: an Invite or an Enable as the owner's own, or the invite to make by hand. */
async function startStep(
  dependencies: ProvisionDependencies,
  tx: Tx,
  { ctx, employee, requestedBy, connectors, changing, start }: ProvisionRequest,
  { step: { appId, action }, page }: { step: ProvisionStep; page: PersonPage },
): Promise<AccountChange> {
  if (action === "invite") {
    const request = { ctx, employeeId: employee.id, appId, requestedBy, connectors, start };
    // Never null: this transaction holds the app for review already.
    return (await askForInvite(dependencies, tx, request))!.latestInvite!;
  }
  if (action === "reactivate") {
    const account = page.appAccounts.find((held) => offersEnable(held, appId))!;
    const change = { appAccountId: account.id, action, requestedBy, changing, start };
    return askForChange(dependencies, tx, change);
  }
  return accountChangeRepository(tx).insertWithoutConnection({
    appAccountId: null,
    appId,
    email: employee.email,
    action: "invite",
    // An app without a connection offers no roles.
    role: null,
    sourceKey: null,
    requestedBy,
    requestedAt: new Date(),
    ...start,
  });
}

/** The person's page with the steps Provision offers them now. */
async function readSteps(
  dependencies: ProvisionDependencies,
  { ctx, employee, appIds, connectors }: ProvisionRequest,
  db: Orm | Tx,
): Promise<{ page: PersonPage; steps: ProvisionStep[] }> {
  const employeeIds = [employee.id];
  const pages = await dependencies.readPersonPages(ctx, employeeIds, db, { appIds, connectors });
  const [steps] = await readProvisionSteps(dependencies, ctx, { employeeIds, pages, db });
  return { page: pages[0]!, steps: steps! };
}

async function readProvisionSteps(
  { directoryConnectors }: ProvisionDependencies,
  ctx: SecurityContext,
  {
    employeeIds,
    pages,
    db,
  }: { employeeIds: readonly string[]; pages: readonly PersonPage[]; db: Orm | Tx },
): Promise<ProvisionStep[][]> {
  ctx.require("MANAGE_WORKSPACE");
  const appIds = pages.flatMap(({ personApps }) => personApps.map(({ appId }) => appId));
  const [connections, active] = await Promise.all([
    appConnectionRepository(db).findByApps([...new Set(appIds)]),
    findEmployeesInDirectory(db, directoryConnectors, { status: "active", among: employeeIds }),
  ]);
  const connectedApps = new Set(connections.map(({ appId }) => appId));
  return pages.map((page, index) =>
    stepsOf(page, { connectedApps, activeInDirectory: active.includes(employeeIds[index]!) }),
  );
}

function stepsOf(
  page: PersonPage,
  { connectedApps, activeInDirectory }: { connectedApps: Set<string>; activeInDirectory: boolean },
): ProvisionStep[] {
  return page.personApps.flatMap(({ appId, state }) => {
    const invite = page.appInvites.find((row) => row.appId === appId);
    const account = page.appAccounts.find((held) => offersEnable(held, appId));
    // The latest change of what Provision would ask for: an Enable of the account, or an invite.
    const asked = account ? account.changeState!.latestChange : invite?.latestInvite;
    const latest = asked?.action === (account ? "reactivate" : "invite") ? asked : null;
    const action = provisionActionOf({
      missing: state === "missing",
      activeInDirectory,
      connected: connectedApps.has(appId),
      enableOffered: account !== undefined,
      inviteOffered: invite?.offered ?? false,
      waitsByHand: invite?.latestInvite?.status === "failed",
      lastFailure: latest?.status === "failed" ? latest.error : null,
    });
    return action ? [{ appId, action }] : [];
  });
}

function offersEnable(account: PersonPage["appAccounts"][number], appId: string): boolean {
  return account.appId === appId && account.changeState?.offeredChange === "reactivate";
}
