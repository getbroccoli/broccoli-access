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
import { type AppInvite, readAppInvites } from "./appInvite";
import { type AppUser, toAppUser } from "./appUserService";
import { changeStatesOf } from "./changeStates";
import { findDirectoryAppId } from "./directory";
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
}

/** Queues the person's Disables and publishes their offboarding, as `AccountChangeService` says. */
export async function offboardEmployee(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  { employeeId, appIds }: { employeeId: string; appIds: readonly string[] },
): Promise<EmployeeOffboarding> {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user) {
    throw new ApplicationError("FORBIDDEN", "Only a signed-in user can offboard a person.");
  }
  const requestedBy = ctx.user.userId;
  const [employee] = parseUuid(employeeId)
    ? await dependencies.employees.readEmployees(ctx, [employeeId])
    : [];
  if (!employee) {
    throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  }
  // Read before the transaction: the container's list may take a while to answer.
  const connectors = await dependencies.connectors.list();
  const changeIds = await dependencies.transact(async (tx) => {
    const queued = await queueDisables(dependencies, tx, {
      employeeId: employee.id,
      appIds,
      requestedBy,
      connectors,
    });
    tx.publish("apps.employeeOffboarded", { employeeId: employee.id, requestedBy });
    return queued;
  });
  dependencies.logger.info({ employeeId: employee.id, changeIds }, "Employee offboarded");
  const [offboarding] = await readOffboardings(dependencies, ctx, [employee.id]);
  return offboarding!;
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
    readAppInvites(dependencies, ctx, employeeIds, db),
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
 * Writes the employee's running Disables and queues each in its connection's group, the
 * directory's first, joining `tx`; returns the changes' ids.
 */
async function queueDisables(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  {
    employeeId,
    appIds,
    requestedBy,
    connectors,
  }: {
    employeeId: string;
    appIds: readonly string[];
    requestedBy: string;
    connectors: readonly Connector[];
  },
): Promise<string[]> {
  // The lock scans and a second Offboard take first, so the accounts read below stay as they are.
  await appAccountRepository(tx).lockForSync();
  const { facts, ...accounts } = await readAccounts(dependencies, tx, [employeeId], connectors);
  const { accountsToDisable } = offboardingOf({
    employeeId,
    offboardedAt: null,
    invitedAppIds: [],
    invitingAppIds: [],
    ...accounts,
  });
  const requestedAt = new Date();
  const changeIds: string[] = [];
  // Only what the owner confirmed: an account found since the dialog opened stays as it is.
  for (const account of accountsToDisable.filter(({ appId }) => appIds.includes(appId))) {
    // An account that offers Disable has its connection and the connection's member.
    const { connection, member } = facts.get(account.id)!;
    const change = await accountChangeRepository(tx).insertRunning({
      appAccountId: account.id,
      appId: account.appId,
      email: account.email,
      connectionId: connection!.id,
      action: "suspend",
      role: null,
      sourceKey: member!.sourceKey,
      requestedBy,
      requestedAt,
      startedFrom: "offboarding",
      employeeId,
    });
    // A Disable of the same account asked meanwhile committed first, and does the same.
    if (!change) {
      continue;
    }
    await dependencies.jobs.send(tx, RUN_JOB, { changeId: change.id }, { group: connection!.id });
    changeIds.push(change.id);
  }
  return changeIds;
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
  const changing = await changingConnectors({ list: () => Promise.resolve(connectors) });
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
  };
}
