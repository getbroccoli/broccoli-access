import { ApplicationError } from "../../../core/applicationError";
import type { Connector } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { accountChangeRepository, appAccountRepository } from "../db";
import { type OffboardingByHandWork, offboardingPlanOf } from "../domain";
import { type AccountFacts, changingConnectors, readAccountFacts } from "./accountFacts";
import {
  type AccountChangeDependencies,
  type AccountChangeState,
  RUN_JOB,
} from "./accountChangeService";
import { type AppInvite, readEmployeeInviteRows } from "./appInvite";
import { type AppUser, toAppUser } from "./appUserService";
import { changeStatesOf } from "./changeStates";
import { findDirectoryAppId, requireDirectoryMatchForOffboarding } from "./directory";
import { findInAppFacts } from "./inAppFacts";

/** What Offboard would do for a person now, and when they were last offboarded. */
export interface EmployeeOffboarding {
  employeeId: string;
  /**
   * When the newest change started from their offboarding was asked; null before the first.
   * shortcut: an offboarding that disabled nothing leaves no change, so it reads as never
   * offboarded; store the offboarding itself once its date must show without a change.
   */
  offboardedAt: Date | null;
  /** Their account in the directory, whatever its status; null without one. */
  directoryAccount: AppUser | null;
  /** Their active accounts that offer Disable now: the directory's first, then by app name. */
  accountsToDisable: AppUser[];
  /** What the owner does by hand, as the offboarding plan orders it. */
  byHandWork: OffboardingByHandWork[];
  /** Their disabled accounts that offer Remove now, never the directory's, by app name. */
  accountsToRemove: AppUser[];
}

/**
 * Queues a Remove of each of the person's disabled accounts, in the apps the owner confirmed, as
 * single Removes from their rows would; returns their offboarding as it is afterwards.
 */
export async function removeEmployeeAccounts(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  { employeeId, accountIds }: { employeeId: string; accountIds: readonly string[] },
): Promise<EmployeeOffboarding> {
  const { employee, requestedBy } = await readAsker(
    dependencies,
    ctx,
    employeeId,
    "remove accounts",
  );
  const connectors = await dependencies.connectors.list();
  const changeIds = await dependencies.transact((tx) =>
    queueChanges(dependencies, tx, {
      employeeId: employee.id,
      only: accountIds,
      requestedBy,
      connectors,
      action: "remove",
    }),
  );
  dependencies.logger.info(
    { employeeId: employee.id, changeIds },
    "Employee account removals queued",
  );
  const [offboarding] = await readOffboardings(dependencies, ctx, [employee.id]);
  return offboarding!;
}

/** Queues the person's Disables and publishes their offboarding, as `AccountChangeService` says. */
export async function offboardEmployee(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  { employeeId, appIds }: { employeeId: string; appIds: readonly string[] },
): Promise<EmployeeOffboarding> {
  const { employee, requestedBy } = await readAsker(
    dependencies,
    ctx,
    employeeId,
    "offboard a person",
  );
  // Read before the transaction: the container's list may take a while to answer.
  const connectors = await dependencies.connectors.list();
  const changeIds = await dependencies.transact(async (tx) => {
    const queued = await queueChanges(dependencies, tx, {
      employeeId: employee.id,
      only: appIds,
      requestedBy,
      connectors,
      action: "suspend",
    });
    tx.publish("apps.employeeOffboarded", { employeeId: employee.id, requestedBy });
    return queued;
  });
  dependencies.logger.info({ employeeId: employee.id, changeIds }, "Employee offboarded");
  const [offboarding] = await readOffboardings(dependencies, ctx, [employee.id]);
  return offboarding!;
}

/** The employee and the signed-in user who asks for a change of their accounts. */
async function readAsker(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  employeeId: string,
  does: string,
) {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user) {
    throw new ApplicationError("FORBIDDEN", `Only a signed-in user can ${does}.`);
  }
  const [employee] = parseUuid(employeeId)
    ? await dependencies.employees.readEmployees(ctx, [employeeId])
    : [];
  if (!employee) {
    throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  }
  return { employee, requestedBy: ctx.user.userId };
}

/** Each employee's offboarding, in the ids' order. */
export async function readOffboardings(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  employeeIds: readonly string[],
  db = dependencies.orm,
): Promise<EmployeeOffboarding[]> {
  ctx.require("MANAGE_WORKSPACE");
  const connectors = await dependencies.connectors.list();
  const [accounts, invites, offboardedAt] = await Promise.all([
    readAccounts(dependencies, db, employeeIds, connectors),
    readEmployeeInviteRows(dependencies, ctx, employeeIds, db).then(({ rows }) => rows),
    accountChangeRepository(db).findLastOffboardings(employeeIds),
  ]);
  const usersByEmployee = Map.groupBy(accounts.users, (user) => user.employeeId);
  const invitesByEmployee = Map.groupBy(invites, (invite) => invite.employeeId);
  const appIdsOf = (employeeId: string, shows: (invite: AppInvite) => boolean) =>
    (invitesByEmployee.get(employeeId) ?? []).filter(shows).map(({ appId }) => appId);
  return employeeIds.map((employeeId) =>
    offboardingOf({
      employeeId,
      offboardedAt: offboardedAt.get(employeeId) ?? null,
      users: usersByEmployee.get(employeeId) ?? [],
      invitedAppIds: appIdsOf(employeeId, ({ invitedAt }) => invitedAt !== null),
      invitingAppIds: appIdsOf(employeeId, (invite) => invite.latestInvite?.status === "running"),
      directoryAppId: accounts.directoryAppId,
    }),
  );
}

/**
 * Writes the employee's running Disables, started from their offboarding, or Removes, as a
 * single Remove is, and queues each in its connection's group, the directory's first, joining
 * `tx`; returns the changes' ids.
 */
async function queueChanges(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  {
    employeeId,
    only,
    requestedBy,
    connectors,
    action,
  }: {
    employeeId: string;
    /** The ids the owner confirmed: of apps for Disable, of accounts for Remove. */
    only: readonly string[];
    requestedBy: string;
    connectors: readonly Connector[];
    action: "suspend" | "remove";
  },
): Promise<string[]> {
  // The lock scans and a second Offboard take first, so the accounts read below stay as they are.
  await appAccountRepository(tx).lockForSync();
  if (action === "suspend") await requireDirectoryMatchForOffboarding(dependencies, tx, employeeId);
  const { facts, ...accounts } = await readAccounts(dependencies, tx, [employeeId], connectors);
  const offboarding = offboardingOf({
    employeeId,
    offboardedAt: null,
    invitedAppIds: [],
    invitingAppIds: [],
    ...accounts,
  });
  const requestedAt = new Date();
  const changeIds: string[] = [];
  const confirmed = confirmedAccounts(offboarding, action, only);
  // Locked in id order, so a row's change of the same account cannot deadlock with this; queued in
  // the plan's order, the directory's first.
  for (const { id } of confirmed.toSorted((a, b) => a.id.localeCompare(b.id))) {
    await appAccountRepository(tx).lockById(id);
  }
  for (const account of confirmed) {
    const { connection, member } = facts.get(account.id)!;
    const changeId = await queueChange(dependencies, tx, {
      account,
      // An account that offers the change has its connection and the connection's member.
      connection: connection!,
      member: member!,
      action,
      employeeId,
      requestedBy,
      requestedAt,
    });
    if (changeId) {
      changeIds.push(changeId);
    }
  }
  return changeIds;
}

/** Only what the owner confirmed: an account found since the dialog opened stays as it is. */
function confirmedAccounts(
  { accountsToDisable, accountsToRemove }: EmployeeOffboarding,
  action: "suspend" | "remove",
  only: readonly string[],
): AppUser[] {
  return action === "suspend"
    ? accountsToDisable.filter(({ appId }) => only.includes(appId))
    : accountsToRemove.filter(({ id }) => only.includes(id));
}

/** Writes one running change and queues its run; null when the same change was asked meanwhile. */
async function queueChange(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  {
    account,
    connection,
    member,
    action,
    employeeId,
    requestedBy,
    requestedAt,
  }: {
    account: AppUser;
    connection: { id: string };
    member: { sourceKey: string };
    action: "suspend" | "remove";
    employeeId: string;
    requestedBy: string;
    requestedAt: Date;
  },
): Promise<string | null> {
  const change = await accountChangeRepository(tx).insertRunning({
    appAccountId: account.id,
    appId: account.appId,
    email: account.email,
    connectionId: connection.id,
    action,
    role: null,
    sourceKey: member.sourceKey,
    requestedBy,
    requestedAt,
    // A Remove keeps the offboarding's date and is one of its account's own, as from its row.
    startedFrom: action === "suspend" ? "offboarding" : "account",
    employeeId: action === "suspend" ? employeeId : null,
  });
  // A change of the same account asked meanwhile committed first, and does the same.
  if (!change) {
    return null;
  }
  await dependencies.jobs.send(tx, RUN_JOB, { changeId: change.id }, { group: connection.id });
  return change.id;
}

/** An account with what its row shows of Disable and Enable. */
type OffboardingUser = AppUser & { changeState: AccountChangeState };

/** The employees' current accounts in approved apps, the directory's among them, by app name. */
async function readAccounts(
  dependencies: AccountChangeDependencies,
  db: Orm | Tx,
  employeeIds: readonly string[],
  connectors: readonly Connector[],
): Promise<{
  users: OffboardingUser[];
  facts: Map<string, AccountFacts>;
  /** Null before the directory is connected. */
  directoryAppId: string | null;
}> {
  const inAppFacts = await findInAppFacts(db, { connectors, members: dependencies.members });
  const [found, directoryAppId] = await Promise.all([
    appAccountRepository(db).findCurrentAccountsOfEmployees(employeeIds, inAppFacts),
    findDirectoryAppId(db, connectors),
  ]);
  // The facts read whole accounts, such as their kind.
  const accounts = await appAccountRepository(db).findByIds(found.map(({ id }) => id));
  // The connectors read before any lock, so this never waits for the container under one.
  const changing = changingConnectors(connectors);
  const facts = await readAccountFacts(dependencies, db, accounts, changing);
  const states = await changeStatesOf(db, facts);
  const suspendedInDirectory = new Set(
    found
      .filter(({ appId, status }) => appId === directoryAppId && status === "suspended")
      .map(({ employeeId }) => employeeId),
  );
  const users = found.flatMap((account) => {
    // A scan may delete an account between the two reads; it is then no longer theirs.
    const changeState = states.get(account.id);
    return changeState ? [{ ...toAppUser(account, suspendedInDirectory), changeState }] : [];
  });
  return { users, facts, directoryAppId };
}

/** One employee's offboarding from their accounts and the apps that show them Invited. */
function offboardingOf({
  employeeId,
  offboardedAt,
  users,
  invitedAppIds,
  invitingAppIds,
  directoryAppId,
}: {
  employeeId: string;
  offboardedAt: Date | null;
  users: readonly OffboardingUser[];
  invitedAppIds: readonly string[];
  invitingAppIds: readonly string[];
  directoryAppId: string | null;
}): EmployeeOffboarding {
  const plan = offboardingPlanOf({
    accounts: users.map(({ id, appId, status, changeState }) => ({
      id,
      appId,
      status,
      isDirectory: appId === directoryAppId,
      offeredChange: changeState.offeredChange,
      offersReconnect: changeState.offersReconnect,
      isConnectionUser: changeState.isConnectionUser,
      runningChange:
        changeState.latestChange?.status === "running" ? changeState.latestChange.action : null,
    })),
    invitedAppIds,
    invitingAppIds,
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  return {
    employeeId,
    offboardedAt,
    directoryAccount: users.find(({ appId }) => appId === directoryAppId) ?? null,
    accountsToDisable: plan.accountIdsToDisable.map((id) => byId.get(id)!),
    byHandWork: plan.byHandWork,
    accountsToRemove: users.filter(
      ({ appId, changeState }) => appId !== directoryAppId && changeState.offersRemove,
    ),
  };
}
