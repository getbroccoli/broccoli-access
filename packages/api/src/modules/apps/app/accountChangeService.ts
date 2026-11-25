import { ApplicationError } from "../../../core/applicationError";
import type { AccountAction, Connector, ConnectorRegistry } from "../../../core/connectors";
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
  appAccountRepository,
  appConnectionRepository,
} from "../db";
import type { AccountChange, AccountChangeAction } from "../domain";
import type { ConnectionMembers, EmployeesByName, IntegrationUser } from "../ports";
import { changingConnectors, readAccountFacts, readChangeFacts } from "./accountFacts";
import { createAppConnectionService } from "./appConnectionService";
import { type AppInvite, inviteEmployee, readAppInvites } from "./appInvite";
import { loggingRefusal } from "./loggingRefusal";
import { markChangeDoneByHand } from "./markChangeDoneByHand";
import type { ReconnectReason } from "./connectionReconnects";
import { failRunningChange, runAccountChange } from "./runAccountChange";

/**
 * Disable and Enable of app accounts, and Invite of employees to apps they have no account in:
 * asked by the owner, run as a job, read by the account and invite rows and Activity.
 */
export interface AccountChangeService {
  /**
   * Asks for a Disable (`suspend`) or Enable (`reactivate`) of the app account: in one transaction
   * writes the change `running`, with the account's app and email and the connection's source key
   * copied, and queues its run, one per connection at a time; returns it with its place in the
   * queue. Needs MANAGE_WORKSPACE and a signed-in user; refuses an unknown account with NOT_FOUND,
   * and an action the account does not offer now (`offeredChange`), which Invite never is, with
   * CONFLICT.
   */
  changeAccount: (
    ctx: SecurityContext,
    input: { appAccountId: string; action: AccountChangeAction },
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
   * found no member with their email, where Invite or Reconnect is offered or an invite was asked;
   * by employee, then app name. Needs MANAGE_WORKSPACE.
   */
  readAppInvites: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
    db?: Orm,
  ) => Promise<AppInvite[]>;
  /**
   * The run's job: makes the change through the connector, trying a rate-limited or unavailable
   * call again; saves a renewed connection first. When the member reads back with the new status,
   * the change succeeds and sets the account's status with a history line by the user who asked;
   * an invite succeeds when the invitation, or the email's member, reads back. Otherwise it fails
   * with the error. Skips a change no longer running. System only.
   */
  runChange: (ctx: SecurityContext, changeId: string) => Promise<void>;
  /** The job's attempts are used up: a running change fails with `app_unavailable`. System only. */
  failChange: (ctx: SecurityContext, changeId: string) => Promise<void>;
  /**
   * "I did it by hand": the change, failed and its account's latest, becomes `done_by_hand` with its
   * error kept, and the account takes the status the change asked for at once, with a history line
   * by the signed-in user unless it already had it. A failed invite, its connection's and email's
   * latest, becomes `done_by_hand` alone. Needs MANAGE_WORKSPACE; refuses an unknown change with
   * NOT_FOUND, and any other with CONFLICT.
   */
  markChangeDoneByHand: (ctx: SecurityContext, changeId: string) => Promise<LatestAccountChange>;
  /** What each of the app accounts offers and its latest change, by account id. Needs MANAGE_WORKSPACE. */
  readChangeStates: (
    ctx: SecurityContext,
    appAccountIds: readonly string[],
    db?: Orm,
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
  members: ConnectionMembers;
  /** The employees module, which owns their emails, which invites go to. */
  employees: EmployeesByName;
  /** Whose accounts never offer a change. */
  integrationUser: IntegrationUser;
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
    async changeAccount(ctx, { appAccountId, action }) {
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
        const changing = await changingConnectors(dependencies.connectors);
        return dependencies.transact((tx) =>
          askForChange(dependencies, tx, { appAccountId, action, requestedBy, changing }),
        );
      });
      logger.info(
        { changeId: change.id, appAccountId, connectionId: change.connectionId, action },
        "Account change requested",
      );
      return change;
    },
    inviteEmployee: (ctx, input) => inviteEmployee(dependencies, ctx, input),
    readAppInvites: (ctx, employeeIds, db) => readAppInvites(dependencies, ctx, employeeIds, db),
    runChange: (ctx, changeId) => runAccountChange(run, ctx, changeId),
    failChange: (ctx, changeId) => failRunningChange(dependencies, ctx, changeId),
    markChangeDoneByHand: (ctx, changeId) => markChangeDoneByHand(dependencies, ctx, changeId),
    async readChangeStates(ctx, appAccountIds, db = orm) {
      const facts = await readChangeFacts(dependencies, ctx, db, appAccountIds);
      const running = [...facts.values()].flatMap(({ latest }) =>
        latest?.status === "running" ? [latest.id] : [],
      );
      const ahead = running.length
        ? await accountChangeRepository(db).countChangesAhead(running)
        : new Map<string, number>();
      return new Map(
        Array.from(facts, ([id, { isConnectionUser, latest, offered, reconnectOffered }]) => {
          return [
            id,
            {
              isConnectionUser,
              offeredChange: offered,
              offersReconnect: reconnectOffered,
              latestChange: latest && withPlace(latest, ahead),
            },
          ];
        }),
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
        changingConnectors(dependencies.connectors),
      ]);
      return new Set(
        connections.filter(({ connector }) => changing.has(connector)).map(({ appId }) => appId),
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

const NOT_OFFERED = "This change is not offered on this account now.";

/** Writes the running change and queues its run in the connection's group, refusing what is not offered. */
async function askForChange(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  {
    appAccountId,
    action,
    requestedBy,
    changing,
  }: {
    appAccountId: string;
    action: AccountChangeAction;
    requestedBy: string;
    changing: Set<string>;
  },
): Promise<LatestAccountChange> {
  const id = parseUuid(appAccountId);
  // Locked, so a change finishing meanwhile commits first and its outcome is read below.
  const account = id && (await appAccountRepository(tx).lockById(id));
  if (!account) {
    throw new ApplicationError("NOT_FOUND", "No app account has this id.");
  }
  const facts = await readAccountFacts(dependencies, tx, [account], changing);
  const { offered, connection, member } = facts.get(account.id)!;
  if (offered !== action || !connection || !member) {
    throw new ApplicationError("CONFLICT", NOT_OFFERED);
  }
  const changes = accountChangeRepository(tx);
  const change = await changes.insertRunning({
    appAccountId: account.id,
    appId: account.appId,
    email: account.email,
    connectionId: connection.id,
    action,
    sourceKey: member.sourceKey,
    role: null,
    requestedBy,
    requestedAt: new Date(),
  });
  // A concurrent ask of the same account committed first.
  if (!change) {
    throw new ApplicationError("CONFLICT", NOT_OFFERED);
  }
  await dependencies.jobs.send(tx, RUN_JOB, { changeId: change.id }, { group: connection.id });
  return withPlace(change, await changes.countChangesAhead([change.id]));
}

/** The change with its place in its connection's queue while it runs. */
export function withPlace(change: AccountChange, ahead: Map<string, number>): LatestAccountChange {
  return {
    ...change,
    changesAhead: change.status === "running" ? (ahead.get(change.id) ?? 0) : null,
  };
}
