import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../core/db";
import { createSetupStepService } from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import { type Connection, type PageArgs, paginate } from "../../../core/pagination";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import {
  type App,
  APP_SORT_VALUES,
  appAccountRepository,
  appConnectionRepository,
  appRepository,
  type EmployeeAppAccount,
} from "../db";
import {
  type AccountDates,
  accountSince,
  appChanges,
  appSince,
  type AppStatus,
  countSuspendedWithAccess,
  type FoundApp,
  planAppMatches,
  type Since,
} from "../domain";
import type { ConnectionMembers } from "../ports";
import {
  type DirectoryConnectors,
  activeInDirectory,
  findDirectoryAppId,
  findEmployeesInDirectory,
} from "./directory";
import { findInAppFacts } from "./inAppFacts";

const recordHistory = createRecordHistoryService();
const setupSteps = createSetupStepService();

/** An app approved or ignored by a signed-in user. */
const EDITED_DIRECTLY: HistoryAppend["cause"] = { kind: "EDITED_DIRECTLY" };

/** The apps the scans find, and the owner's choice of those the company uses. */
export interface AppService {
  /**
   * Matches each found app to an app, joining `tx`: creates the missing ones as discovered and adds
   * new external ids to known ones, appending their history with `cause`. Returns the app ids by
   * external id. System only.
   */
  matchFoundApps: (
    ctx: SecurityContext,
    tx: Tx,
    match: { found: readonly FoundApp[]; cause: HistoryAppend["cause"] },
  ) => Promise<Map<string, string>>;
  /** The apps with `status`, the most people first, then by name. Needs MANAGE_WORKSPACE. */
  listApps: (
    ctx: SecurityContext,
    args: PageArgs & { status: AppStatus },
  ) => Promise<Connection<AppSummary>>;
  /** The app as the app list shows it; null for an unknown or malformed id. Needs MANAGE_WORKSPACE. */
  readApp: (ctx: SecurityContext, appId: string) => Promise<AppSummary | null>;
  /** The apps with these ids as the app list shows them; an unknown id is left out. Needs MANAGE_WORKSPACE. */
  readApps: (ctx: SecurityContext, appIds: readonly string[]) => Promise<AppSummary[]>;
  /** How many apps have each status. Needs MANAGE_WORKSPACE. */
  countApps: (ctx: SecurityContext) => Promise<Record<AppStatus, number>>;
  /** Approves the app, with its history line; refuses an unknown id with NOT_FOUND. Needs MANAGE_WORKSPACE. */
  approveApp: (ctx: SecurityContext, appId: string) => Promise<AppSummary>;
  /**
   * Ignores the app, with its history line; refuses an unknown id with NOT_FOUND, and a connected
   * app, which stays approved, with CONFLICT. Needs MANAGE_WORKSPACE.
   */
  ignoreApp: (ctx: SecurityContext, appId: string) => Promise<AppSummary>;
  /**
   * Setup's last step, in one transaction: approves the listed discovered apps, ignores every other
   * discovered app and finishes setup, with a history line per app. Refuses with CONFLICT at
   * another step, and an id that is no discovered app as invalid `approvedAppIds`. Needs
   * MANAGE_WORKSPACE.
   */
  finishSetup: (
    ctx: SecurityContext,
    selection: { approvedAppIds: readonly string[] },
  ) => Promise<void>;
  /** Serializes source loss and access changes per affected app. */
  lockAppsForReview: (tx: Tx, ids: readonly string[]) => Promise<{ id: string; name: string }[]>;
  activeInDirectory: (db: Orm | Tx, employeeId: string) => Promise<boolean>;
  /**
   * The directory's app: the app of the connection whose connector is the directory; null before
   * it is connected. Trusted read: no `ctx`.
   */
  directoryAppId: (db: Orm | Tx) => Promise<string | null>;
  /** The employees whose account in the directory's app is suspended. Trusted read: no `ctx`. */
  findEmployeesSuspendedInDirectory: (db: Orm | Tx) => Promise<string[]>;
  /** The employee ids attached to the selected app accounts. Trusted read. */
  findAccountOwners: (
    db: Orm | Tx,
    ids: readonly string[],
  ) => Promise<{ id: string; employeeId: string | null }[]>;
  /**
   * Every account that belongs to an employee and is in its app, with its app's name and status,
   * whether the app is the directory's, how it was found and since when. Trusted read: no `ctx`.
   */
  findEmployeeAccounts: (
    db: Orm | Tx,
    employeeIds?: readonly string[],
    appIds?: readonly string[],
  ) => Promise<EmployeeAccountInApp[]>;
}

/** An employee's account as People and a person's page read it. */
export interface EmployeeAccountInApp extends Omit<EmployeeAppAccount, keyof AccountDates> {
  /** Whether the app is the directory's, such as Google Workspace. */
  inDirectory: boolean;
  since: Since;
}

/** An app with what the app list shows of it, computed from its users' accounts that are in it. */
export interface AppSummary extends App {
  /** How many people have an account in it. */
  peopleCount: number;
  /** The finding kinds that saw its users' accounts, sorted, such as `google_sign_in`. */
  foundVia: string[];
  /** Null without users. */
  since: Since | null;
  /** How many of its users still have an active account though the directory suspended them. */
  suspendedWithAccessCount: number;
  /** Whether a connection reads it; a connected app stays approved. */
  connected: boolean;
}

interface AppDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  /** The core's own connectors; the one whose `isDirectory` is set names the directory. */
  connectors: DirectoryConnectors;
  /** The imports module, which knows which connections have finished a scan. */
  members: ConnectionMembers;
}

export function createAppService(dependencies: AppDependencies): AppService {
  const { orm, transact, logger, connectors } = dependencies;
  return {
    async matchFoundApps(ctx, tx, { found, cause }) {
      ctx.requireSystem();
      const repository = appRepository(tx);
      const { created, updated } = planAppMatches(await repository.findAll(), found);
      const inserted = await repository.insertMany(created, "discovered");
      for (const { after } of updated) {
        await repository.updateExternalIds(after.id, after.externalIds);
      }
      await appendHistory(ctx, tx, { inserted, updated }, cause);
      return appIdsByExternalId(await repository.findAll());
    },
    async listApps(ctx, { status, ...pageArgs }) {
      ctx.require("MANAGE_WORKSPACE");
      const inAppFacts = await findInAppFacts(orm, dependencies);
      const page = await paginate(pageArgs, {
        order: { field: "PEOPLE", direction: "DESC" },
        keysetValues: APP_SORT_VALUES,
        fetch: (query) => appRepository(orm).findPage({ ...query, status, inAppFacts }),
      });
      const summaries = await summarize(
        dependencies,
        page.edges.map(({ node }) => node),
      );
      return {
        ...page,
        edges: page.edges.map((edge, index) => ({ ...edge, node: summaries[index]! })),
      };
    },
    async readApp(ctx, appId) {
      ctx.require("MANAGE_WORKSPACE");
      const id = parseUuid(appId);
      const app = id && (await appRepository(orm).findById(id));
      return app ? (await summarize(dependencies, [app]))[0]! : null;
    },
    async readApps(ctx, appIds) {
      ctx.require("MANAGE_WORKSPACE");
      return summarize(dependencies, await appRepository(orm).findByIds(appIds));
    },
    async countApps(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return appRepository(orm).countByStatus();
    },
    approveApp: (ctx, appId) => changeStatus(dependencies, ctx, { appId, status: "approved" }),
    ignoreApp: (ctx, appId) => changeStatus(dependencies, ctx, { appId, status: "ignored" }),
    async finishSetup(ctx, { approvedAppIds }) {
      ctx.require("MANAGE_WORKSPACE");
      const { approved, ignored } = await transact(async (tx) => {
        await setupSteps.finishSelectAppsStep(ctx, tx);
        return settleDiscoveredApps(ctx, tx, new Set(approvedAppIds));
      });
      logger.info({ approved, ignored }, "Setup finished: the selected apps are approved");
    },
    lockAppsForReview: (tx, ids) => appRepository(tx).lockForReview(ids),
    activeInDirectory: (db, employeeId) => activeInDirectory(db, connectors, employeeId),
    directoryAppId: (db) => findDirectoryAppId(db, connectors),
    findEmployeesSuspendedInDirectory: (db) =>
      findEmployeesInDirectory(db, connectors, { status: "suspended" }),
    findAccountOwners: (db, ids) => appAccountRepository(db).findByIds(ids),
    async findEmployeeAccounts(db, employeeIds, appIds) {
      const inAppFacts = await findInAppFacts(db, dependencies);
      const [accounts, directoryAppId] = await Promise.all([
        appAccountRepository(db).findEmployeeAccounts(inAppFacts, employeeIds, appIds),
        findDirectoryAppId(db, connectors),
      ]);
      return accounts.map(({ grantedAt, grantedBefore, firstSeenAt, ...account }) => ({
        ...account,
        inDirectory: account.appId === directoryAppId,
        since: accountSince({ grantedAt, grantedBefore, firstSeenAt }),
      }));
    },
  };
}

/** Moves the app to `status` with its history line, and returns it as the app list shows it. */
async function changeStatus(
  dependencies: AppDependencies,
  ctx: SecurityContext,
  { appId, status }: { appId: string; status: AppStatus },
): Promise<AppSummary> {
  const { transact, logger } = dependencies;
  ctx.require("MANAGE_WORKSPACE");
  const { app, changed } = await transact((tx) => changeStatusWithHistory(ctx, tx, appId, status));
  if (changed) {
    logger.info({ appId, status }, "App status changed");
  }
  const [summary] = await summarize(dependencies, [app]);
  return summary!;
}

/** Moves the app to `status` and appends its history line, unless it is there already. */
async function changeStatusWithHistory(
  ctx: SecurityContext,
  tx: Tx,
  appId: string,
  status: AppStatus,
): Promise<{ app: App; changed: boolean }> {
  const repository = appRepository(tx);
  const id = parseUuid(appId);
  const before = id && (await repository.lockById(id));
  if (!before) {
    throw new ApplicationError("NOT_FOUND", "No app has this id.");
  }
  const connections = await appConnectionRepository(tx).findByApps([before.id]);
  if (status === "ignored" && connections.length > 0) {
    throw new ApplicationError("CONFLICT", "A connected app stays approved.");
  }
  if (before.status === status) {
    return { app: before, changed: false };
  }
  const after = { ...before, status };
  await repository.updateStatus([before.id], status);
  await appendUpdates(ctx, tx, [{ before, after }], EDITED_DIRECTLY);
  return { app: after, changed: true };
}

/** Approves the selected discovered apps and ignores the others; refuses a selection of another app. */
async function settleDiscoveredApps(
  ctx: SecurityContext,
  tx: Tx,
  selected: ReadonlySet<string>,
): Promise<{ approved: number; ignored: number }> {
  const repository = appRepository(tx);
  const discovered = await repository.lockByStatus("discovered");
  const discoveredIds = new Set(discovered.map(({ id }) => id));
  if ([...selected].some((id) => !discoveredIds.has(id))) {
    throw invalidInput([{ field: "approvedAppIds", code: "invalid" }]);
  }
  const changes = discovered.map((before) => {
    const status: AppStatus = selected.has(before.id) ? "approved" : "ignored";
    return { before, after: { ...before, status } };
  });
  const idsWith = (status: AppStatus) =>
    changes.filter(({ after }) => after.status === status).map(({ after }) => after.id);
  await repository.updateStatus(idsWith("approved"), "approved");
  await repository.updateStatus(idsWith("ignored"), "ignored");
  await appendUpdates(ctx, tx, changes, EDITED_DIRECTLY);
  return { approved: idsWith("approved").length, ignored: idsWith("ignored").length };
}

/**
 * The apps with their people, how those were found, since when, who keeps access though suspended,
 * and whether they are connected.
 */
async function summarize(
  dependencies: Pick<AppDependencies, "orm" | "connectors" | "members">,
  apps: readonly App[],
): Promise<AppSummary[]> {
  const { orm, connectors } = dependencies;
  const accounts = appAccountRepository(orm);
  const appIds = apps.map(({ id }) => id);
  const inAppFacts = await findInAppFacts(orm, dependencies);
  const [accountsOfUsers, connections, suspended] = await Promise.all([
    accounts.findUsersOfApps(appIds, inAppFacts),
    appConnectionRepository(orm).findByApps(appIds),
    findEmployeesInDirectory(orm, connectors, { status: "suspended" }),
  ]);
  const users = accountsOfUsers.filter(({ inApp }) => inApp !== false);
  const usersByApp = Map.groupBy(users, ({ appId }) => appId);
  const connectedAppIds = new Set(connections.map(({ appId }) => appId));
  const suspendedInDirectory = new Set(suspended);
  return apps.map((app) => {
    const appUsers = usersByApp.get(app.id) ?? [];
    const peopleCount = new Set(appUsers.map(({ employeeId }) => employeeId)).size;
    return {
      ...app,
      peopleCount,
      foundVia: [...new Set(appUsers.flatMap(({ foundVia }) => foundVia))].sort(),
      since: appSince(appUsers),
      suspendedWithAccessCount: countSuspendedWithAccess(appUsers, suspendedInDirectory),
      connected: connectedAppIds.has(app.id),
    };
  });
}

/** One history line per created app and per app that gained external ids. */
async function appendHistory(
  ctx: SecurityContext,
  tx: Tx,
  {
    inserted,
    updated,
  }: { inserted: readonly App[]; updated: readonly { before: App; after: App }[] },
  cause: HistoryAppend["cause"],
): Promise<void> {
  if (inserted.length > 0) {
    await recordHistory.append(ctx, tx, {
      recordType: "app",
      operation: "CREATED",
      cause,
      records: inserted.map((app) => ({ recordId: app.id, changes: appChanges(null, app) })),
    });
  }
  await appendUpdates(ctx, tx, updated, cause);
}

/** One history line per changed app. */
async function appendUpdates(
  ctx: SecurityContext,
  tx: Tx,
  updated: readonly { before: App; after: App }[],
  cause: HistoryAppend["cause"],
): Promise<void> {
  if (updated.length > 0) {
    await recordHistory.append(ctx, tx, {
      recordType: "app",
      operation: "UPDATED",
      cause,
      records: updated.map(({ before, after }) => ({
        recordId: after.id,
        changes: appChanges(before, after),
      })),
    });
  }
}

function appIdsByExternalId(apps: readonly App[]): Map<string, string> {
  return new Map(
    apps.flatMap(({ id, externalIds }) => externalIds.map((externalId) => [externalId, id])),
  );
}
