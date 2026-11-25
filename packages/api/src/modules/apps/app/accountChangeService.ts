import { ApplicationError } from "../../../core/applicationError";
import type {
  AccountAction,
  Connector,
  ConnectorRegistry,
  SessionRenewals,
} from "../../../core/connectors";
import type { Orm, Transact, Tx } from "../../../core/db";
import type { JobQueue } from "../../../core/jobs";
import type { Logger } from "../../../core/logger";
import { type Connection, type PageArgs, paginate } from "../../../core/pagination";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import {
  ACCOUNT_CHANGE_SORT_VALUES,
  accountChangeRepository,
  type AppConnection,
  appConnectionRepository,
} from "../db";
import { type AccountChange, type AccountChangeAction, FROM_ACCOUNT } from "../domain";
import type { ConnectionMembers, EmployeesByName, IntegrationUser } from "../ports";
import { changingConnectors, readChangeFacts } from "./accountFacts";
import { createAppConnectionService } from "./appConnectionService";
import { askForChange } from "./askForChange";
import {
  type AppInvite,
  type AppInviteScope,
  inviteEmployee,
  readEmployeeInviteRows,
} from "./appInvite";
import { loggingRefusal } from "./loggingRefusal";
import { markChangeDoneByHand } from "./markChangeDoneByHand";
import type { DirectoryConnectors } from "./directory";
import { changeStatesOf } from "./changeStates";
import {
  type EmployeeOffboarding,
  offboardEmployee,
  readOffboardings,
  removeEmployeeAccounts,
} from "./offboarding";
import type { ReconnectReason } from "./connectionReconnects";
import { failRunningChange, runAccountChange } from "./runAccountChange";

/**
 * Disable, Enable and Remove of app accounts, and Invite of employees to apps they have no account in:
 * asked by the owner, run as a job, read by the account and invite rows and Activity.
 */
export interface AccountChangeService {
  /**
   * Asks for a Disable, Enable or Remove of the app account: in one transaction
   * writes the change `running`, with the account's app and email and the connection's source key
   * copied, and queues its run, one per connection at a time; returns it with its place in the
   * queue. Needs MANAGE_WORKSPACE and a signed-in user; refuses an unknown account with NOT_FOUND,
   * and an action the account does not offer now, which Invite never is, with
   * CONFLICT.
   */
  changeAccount: (
    ctx: SecurityContext,
    input: {
      appAccountId: string;
      action: AccountChangeAction;
      retryOf?: string | null;
      extraEmployeeId?: string | null;
    },
  ) => Promise<LatestAccountChange>;
  /**
   * Asks for an Invite of the employee to the app: in one transaction writes the invite `running`,
   * with the employee's email and no account or source key, and queues its run like a Disable's;
   * returns the employee's invite row with it. Needs MANAGE_WORKSPACE and a signed-in user; refuses
   * an unknown employee or app with NOT_FOUND, and an invite not offered now (`inviteStateOf`) with
   * CONFLICT.
   */
  inviteEmployee: (
    ctx: SecurityContext,
    input: { employeeId: string; appId: string },
  ) => Promise<AppInvite>;
  /**
   * The employees' rows for the apps whose connection's connector lists `invite` and whose last scan
   * found no member with their email, where Invite or Reconnect is offered or an invite was asked,
   * and for the apps without a connection where their invite is the owner's to make by hand; by
   * employee, then app name. With expected pairs, reads only their pending invitation facts.
   * Needs MANAGE_WORKSPACE.
   */
  readAppInvites: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
    db?: Orm | Tx,
    scope?: AppInviteScope,
  ) => Promise<AppInvite[]>;
  /** The running account changes. Needs MANAGE_WORKSPACE. */
  readRunningChangeIds: (ctx: SecurityContext, db?: Orm | Tx) => Promise<string[]>;
  /** Whether an account has a running Disable. Needs MANAGE_WORKSPACE. */
  hasRunningDisable: (ctx: SecurityContext, ids: readonly string[], tx: Tx) => Promise<boolean>;
  /** Invite rows and the directory readiness used to decide their offers. */
  readEmployeeInviteRows(
    ctx: SecurityContext,
    ids: readonly string[],
    db: Orm | Tx,
    scope?: AppInviteScope,
  ): Promise<{ rows: AppInvite[]; activeInDirectory: Set<string> }>;
  /**
   * The run's job: makes the change through the connector, trying a rate-limited or unavailable
   * call again; saves a renewed connection first. When the member reads back with the new status,
   * the change succeeds and sets the account's status with a history line by the user who asked;
   * an invite succeeds when the invitation, or the email's member, reads back, and saves a member
   * it added at once. Otherwise it fails with the error. Skips a change no longer running. System only.
   */
  runChange: (ctx: SecurityContext, changeId: string) => Promise<void>;
  /** The job's attempts are used up: a running change fails with `app_unavailable`. System only. */
  failChange: (ctx: SecurityContext, changeId: string) => Promise<void>;
  /**
   * "I did it by hand": the change, failed and its account's latest, becomes `done_by_hand` with its
   * error kept, and the account takes the status the change asked for at once, with a history line
   * by the signed-in user unless it already had it. A failed invite, its connection's and email's
   * latest, or without a connection its app's and email's, becomes `done_by_hand` alone. Needs
   * MANAGE_WORKSPACE; refuses an unknown change with
   * NOT_FOUND, and any other with CONFLICT.
   */
  markChangeDoneByHand: (ctx: SecurityContext, changeId: string) => Promise<LatestAccountChange>;
  /**
   * Offboard: in one transaction writes a running Disable, started from offboarding for the
   * employee, for each of their active accounts that offers one in the apps the owner confirmed, the
   * directory's first, queues each like a Disable, and publishes `apps.employeeOffboarded`, on
   * which their templates and app choices are deleted. What it cannot disable stays the owner's
   * work by hand and is never a change. Returns their offboarding as it is afterwards. Needs
   * MANAGE_WORKSPACE and a signed-in user; refuses an unknown employee with NOT_FOUND.
   */
  offboardEmployee: (
    ctx: SecurityContext,
    input: { employeeId: string; appIds: readonly string[] },
  ) => Promise<EmployeeOffboarding>;
  /**
   * Remove all: in one transaction writes a running Remove, started from the account like a single
   * Remove, for each of `accountIds` that is still among the employee's accounts that offer one
   * (`accountsToRemove`), and queues each like a Remove. Never the directory account. Returns
   * their offboarding as it is afterwards. Needs MANAGE_WORKSPACE and a signed-in user; refuses an
   * unknown employee with NOT_FOUND.
   */
  removeEmployeeAccounts: (
    ctx: SecurityContext,
    input: { employeeId: string; accountIds: readonly string[] },
  ) => Promise<EmployeeOffboarding>;
  /** What Offboard would do for each employee now, in the ids' order. Needs MANAGE_WORKSPACE. */
  readOffboardings: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
    db?: Orm,
  ) => Promise<EmployeeOffboarding[]>;
  /** What each of the app accounts offers and its latest change, by account id. Needs MANAGE_WORKSPACE. */
  readChangeStates: (
    ctx: SecurityContext,
    appAccountIds: readonly string[],
    db?: Orm | Tx,
    connectors?: readonly Connector[],
  ) => Promise<Map<string, AccountChangeState>>;
  /**
   * Each of the connections' app, status and, while it needs reconnecting, why, by connection id;
   * an unknown id is left out. Needs MANAGE_WORKSPACE.
   */
  readConnectionStates: (
    ctx: SecurityContext,
    connectionIds: readonly string[],
  ) => Promise<Map<string, ConnectionState>>;
  /**
   * Those of `appIds` whose connection's connector suspends and reactivates accounts. Needs
   * MANAGE_WORKSPACE.
   */
  findAppsWithChangeableAccounts: (
    ctx: SecurityContext,
    appIds: readonly string[],
  ) => Promise<Set<string>>;
  /**
   * One account change, a running one with its place in its connection's queue; null for an
   * unknown id. Needs MANAGE_WORKSPACE.
   */
  readAccountChange: (ctx: SecurityContext, id: string) => Promise<LatestAccountChange | null>;
  /**
   * Every account change, newest first by when it was asked (then by id), one page at a time; a
   * running one with its place in its connection's queue. Needs MANAGE_WORKSPACE.
   */
  listAccountChanges: (
    ctx: SecurityContext,
    args: PageArgs,
  ) => Promise<Connection<LatestAccountChange>>;
  /** The invite roles offered by each app's connection, in manifest order. */
  readAppRoles: (
    ctx: SecurityContext,
    appIds: readonly string[],
  ) => Promise<Map<string, NonNullable<Connector["roles"]>>>;
  /** The names of these users, by user id; for who asked for account changes. Needs MANAGE_WORKSPACE. */
  readRequesterNames: (
    ctx: SecurityContext,
    userIds: readonly string[],
  ) => Promise<Map<string, string>>;
}

/** What an app account's row shows of Disable and Enable. */
export interface AccountChangeState {
  /** Whether it is the member whose key or session its app's connection uses. */
  isConnectionUser: boolean;
  /** Disable or Enable when offered now; null otherwise. */
  offeredChange: AccountAction | null;
  /** Whether this disabled account also offers Remove. */
  offersRemove: boolean;
  /** Whether Reconnect shows instead of Disable or Enable, while its app's connection needs it. */
  offersReconnect: boolean;
  /** Its newest change; null before the first. */
  latestChange: LatestAccountChange | null;
}

/** Whether a connection works, and why not while it needs reconnecting. */
export interface ConnectionState {
  /** The app it connects. */
  appId: string;
  status: AppConnection["status"];
  /** Null while connected. */
  reconnectReason: ReconnectReason | null;
}

export interface LatestAccountChange extends AccountChange {
  /** While running: how many running changes of its connection were asked before it; null once finished. */
  changesAhead: number | null;
}

export interface AccountChangeDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  jobs: JobQueue;
  secretBox: SecretBox;
  /** Every connector a connection may name. */
  connectors: ConnectorRegistry;
  /** Template sources and personal choices at the time of the invite. */
  readInviteRole: (tx: Tx, employeeId: string, appId: string) => Promise<string | null>;
  isExtraApp: (
    ctx: SecurityContext,
    pair: { employeeId: string; appId: string },
    tx: Tx,
  ) => Promise<boolean>;
  members: ConnectionMembers;
  directoryConnectors: DirectoryConnectors;
  findPeopleAwaitingDirectory(db: Orm | Tx, ids: readonly string[]): Promise<Set<string>>;
  /** The employees module, which owns their emails, which invites go to. */
  employees: EmployeesByName & {
    readEmployeesByEmails(
      ctx: SecurityContext,
      emails: readonly string[],
      db: Tx,
    ): Promise<{ id: string }[]>;
  };
  /** Whose accounts never offer a change. */
  integrationUser: IntegrationUser;
  /** Signs in again for a connection made by the integration user's sign-in. */
  renewals: SessionRenewals;
  /** Waits between attempts of a call; tests pass one that does not wait. */
  wait?: (ms: number) => Promise<void>;
}

export function createAccountChangeService(
  dependencies: AccountChangeDependencies,
): AccountChangeService {
  const { orm, logger } = dependencies;
  const run = {
    ...dependencies,
    connections: createAppConnectionService({ secretBox: dependencies.secretBox }),
  };
  return {
    async changeAccount(ctx, { appAccountId, action, retryOf, extraEmployeeId }) {
      const refusal = {
        message: "Account change refused",
        ids: { appAccountId: parseUuid(appAccountId), action },
      };
      const change = await loggingRefusal(logger, refusal, async () => {
        ctx.require("MANAGE_WORKSPACE");
        if (!ctx.user) {
          throw new ApplicationError("FORBIDDEN", "Only a signed-in user can ask for this change.");
        }
        const requestedBy = ctx.user.userId;
        // Read before the transaction: the container's list may take a while to answer.
        const changing = changingConnectors(await dependencies.connectors.list());
        return dependencies.transact((tx) =>
          askForChange(dependencies, tx, {
            appAccountId,
            action,
            retryOf,
            extraConfirmation:
              extraEmployeeId == null ? undefined : { ctx, employeeId: extraEmployeeId },
            requestedBy,
            changing,
            start: FROM_ACCOUNT,
          }),
        );
      });
      logger.info(
        { changeId: change.id, appAccountId, connectionId: change.connectionId, action },
        "Account change requested",
      );
      return change;
    },
    inviteEmployee: (ctx, input) => inviteEmployee(dependencies, ctx, input),
    readAppInvites: async (ctx, ids, db, scope) =>
      (await readEmployeeInviteRows(dependencies, ctx, ids, db, scope)).rows,
    readEmployeeInviteRows: (ctx, ids, db, scope) =>
      readEmployeeInviteRows(dependencies, ctx, ids, db, scope),
    async readRunningChangeIds(ctx, db = orm) {
      ctx.require("MANAGE_WORKSPACE");
      return accountChangeRepository(db).runningIds();
    },
    async hasRunningDisable(ctx, ids, tx) {
      ctx.require("MANAGE_WORKSPACE");
      const changes = await accountChangeRepository(tx).findLatestOfAccounts(ids);
      return changes.some(({ action, status }) => action === "suspend" && status === "running");
    },
    runChange: (ctx, changeId) => runAccountChange(run, ctx, changeId),
    failChange: (ctx, changeId) => failRunningChange(dependencies, ctx, changeId),
    markChangeDoneByHand: (ctx, changeId) => markChangeDoneByHand(dependencies, ctx, changeId),
    offboardEmployee: (ctx, input) => offboardEmployee(dependencies, ctx, input),
    removeEmployeeAccounts: (ctx, input) => removeEmployeeAccounts(dependencies, ctx, input),
    readOffboardings: (ctx, employeeIds, db) =>
      readOffboardings(dependencies, ctx, employeeIds, db),
    async readChangeStates(ctx, appAccountIds, db: Orm | Tx = orm, connectors) {
      return changeStatesOf(
        db,
        await readChangeFacts(dependencies, ctx, db, appAccountIds, connectors),
      );
    },
    async readConnectionStates(ctx, connectionIds) {
      ctx.require("MANAGE_WORKSPACE");
      // An instance has at most one connection per connector, so all of them are few.
      const connections = (await appConnectionRepository(orm).findAll()).filter(({ id }) =>
        connectionIds.includes(id),
      );
      const reasons = await run.connections.readReconnectReasons(orm, connectionIds);
      return new Map(
        connections.map(({ id, appId, status }) => [
          id,
          { appId, status, reconnectReason: reasons.get(id) ?? null },
        ]),
      );
    },
    async readAppRoles(ctx, appIds) {
      ctx.require("MANAGE_WORKSPACE");
      const connections = await appConnectionRepository(orm).findByApps(appIds);
      if (!connections.length) return new Map();
      const connectors = await dependencies.connectors.list();
      const byKey = new Map(connectors.map(({ key, roles }) => [key, roles ?? []]));
      return new Map(
        connections.map(({ appId, connector }) => [appId, byKey.get(connector) ?? []]),
      );
    },
    async findAppsWithChangeableAccounts(ctx, appIds) {
      ctx.require("MANAGE_WORKSPACE");
      const [connections, changing] = await Promise.all([
        appConnectionRepository(orm).findByApps(appIds),
        dependencies.connectors.list().then(changingConnectors),
      ]);
      return new Set(
        connections
          .filter(
            ({ connector }) => changing.status.has(connector) || changing.remove.has(connector),
          )
          .map(({ appId }) => appId),
      );
    },
    async readAccountChange(ctx, id) {
      ctx.require("MANAGE_WORKSPACE");
      const changes = accountChangeRepository(orm);
      const changeId = parseUuid(id);
      const change = changeId && (await changes.findById(changeId));
      return change ? withPlace(change, await changes.countChangesAhead([change.id])) : null;
    },
    async listAccountChanges(ctx, pageArgs) {
      ctx.require("MANAGE_WORKSPACE");
      const changes = accountChangeRepository(orm);
      const page = await paginate(pageArgs, {
        order: { field: "REQUESTED_AT", direction: "DESC" },
        keysetValues: ACCOUNT_CHANGE_SORT_VALUES,
        fetch: (query) => changes.findPage(query),
      });
      const running = page.edges.flatMap(({ node }) =>
        node.status === "running" ? [node.id] : [],
      );
      const ahead = await changes.countChangesAhead(running);
      return {
        ...page,
        edges: page.edges.map((edge) => ({ ...edge, node: withPlace(edge.node, ahead) })),
      };
    },
    async readRequesterNames(ctx, userIds) {
      ctx.require("MANAGE_WORKSPACE");
      return accountChangeRepository(orm).findUserNames(userIds);
    },
  };
}

/** The job that runs a change, one per connection at a time. */
export const RUN_JOB = "apps.runAccountChange";

/** The change with its place in its connection's queue while it runs. */
export function withPlace(change: AccountChange, ahead: Map<string, number>): LatestAccountChange {
  return {
    ...change,
    changesAhead: change.status === "running" ? (ahead.get(change.id) ?? 0) : null,
  };
}
