import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import { type Connection, type PageArgs, paginate } from "../../../core/pagination";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import {
  type App,
  appAccountRepository,
  appRepository,
  type UnlinkedAccount,
  UNLINKED_SORT_VALUES,
} from "../db";
import { accountChanges, employeeMatcher } from "../domain";
import type { ConnectionMembers, EmployeesByName } from "../ports";
import { type AppUser, toAppUser } from "./appUserService";
import { findInAppFacts } from "./inAppFacts";
import { type DirectoryConnectors, findEmployeesInDirectory } from "./directory";

/** Lists personal accounts without an employee and links them at the owner's request. */
export interface AccountLinkService {
  listAccountsWithoutPerson: (
    ctx: SecurityContext,
    page: PageArgs,
  ) => Promise<Connection<AccountWithoutPerson>>;
  countAccountsWithoutPerson: (ctx: SecurityContext) => Promise<number>;
  linkAccount: (
    ctx: SecurityContext,
    input: { appAccountId: string; employeeId: string },
  ) => Promise<AppUser>;
}

export interface AccountWithoutPerson {
  id: string;
  app: App;
  appId: string;
  email: string;
  displayName: string | null;
  suggestedEmployeeId: string | null;
}

interface AccountLinkDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  connectors: DirectoryConnectors;
  members: ConnectionMembers;
  employees: EmployeesByName;
}

export function createAccountLinkService(
  dependencies: AccountLinkDependencies,
): AccountLinkService {
  const { orm, transact, logger, employees } = dependencies;
  return {
    async listAccountsWithoutPerson(ctx, args) {
      requireOwner(ctx);
      const facts = await findInAppFacts(orm, dependencies);
      const page = await paginate(args, {
        order: { field: "EMAIL", direction: "ASC" },
        keysetValues: UNLINKED_SORT_VALUES,
        fetch: (query) => appAccountRepository(orm).findWithoutPerson(query, facts),
      });
      if (!page.edges.length) return { ...page, edges: [] };
      const [names, activeIds] = await Promise.all([
        readMemberNames(
          dependencies,
          page.edges.map(({ node }) => node),
        ),
        findEmployeesInDirectory(orm, dependencies.connectors, { status: "active" }),
      ]);
      const suggest = employeeMatcher(await employees.readEmployees(ctx, activeIds));
      return {
        ...page,
        edges: page.edges.map(({ cursor, node: { id, app, email, connectionId } }) => {
          const displayName = names.get(`${connectionId} ${email}`) ?? null;
          return {
            cursor,
            node: {
              id,
              app,
              appId: app.id,
              email,
              displayName,
              suggestedEmployeeId: suggest({ email, displayName }),
            },
          };
        }),
      };
    },
    async countAccountsWithoutPerson(ctx) {
      requireOwner(ctx);
      return appAccountRepository(orm).countWithoutPerson(await findInAppFacts(orm, dependencies));
    },
    async linkAccount(ctx, input) {
      requireOwner(ctx);
      const appAccountId = parseUuid(input.appAccountId);
      const employeeId = parseUuid(input.employeeId);
      if (!appAccountId) throw new ApplicationError("NOT_FOUND", "No app account has this id.");
      if (!employeeId || !(await employees.readEmployees(ctx, [employeeId])).length) {
        throw new ApplicationError("NOT_FOUND", "No employee has this id.");
      }
      const account = await transact((tx) =>
        saveLink(dependencies, tx, ctx, { appAccountId, employeeId }),
      );
      logger.info({ appAccountId, employeeId }, "App account linked");
      return account;
    },
  };
}

const history = createRecordHistoryService();

function requireOwner(ctx: SecurityContext): void {
  if (!ctx.user?.isOwner)
    throw new ApplicationError("FORBIDDEN", "Only the owner can manage accounts without a person.");
}

async function readMemberNames(
  { orm, members }: AccountLinkDependencies,
  accounts: UnlinkedAccount[],
) {
  const found = await members.findConnectionMembers(orm, {
    connectionIds: [...new Set(accounts.flatMap(({ connectionId }) => connectionId ?? []))],
    emails: accounts.map(({ email }) => email),
  });
  const groups = Map.groupBy(found, ({ connectionId, email }) => `${connectionId} ${email}`);
  return new Map(
    [...groups].map(([key, matches]) => [
      key,
      matches.length === 1 ? matches[0]!.displayName : null,
    ]),
  );
}

async function saveLink(
  dependencies: AccountLinkDependencies,
  tx: Tx,
  ctx: SecurityContext,
  { appAccountId, employeeId }: { appAccountId: string; employeeId: string },
) {
  const accounts = appAccountRepository(tx);
  // Match the lock order of scans and account changes: sync, then account, then app.
  await accounts.lockForSync();
  const facts = await findInAppFacts(tx, dependencies);
  const locked = await accounts.lockById(appAccountId, facts);
  if (!locked) throw new ApplicationError("NOT_FOUND", "No app account has this id.");
  const { inApp, ...before } = locked;
  const app = await appRepository(tx).lockById(before.appId);
  if (
    app?.status !== "approved" ||
    before.kind !== "personal" ||
    before.employeeId !== null ||
    inApp === false
  ) {
    throw new ApplicationError("CONFLICT", "This account is no longer available to link.");
  }
  const after = { ...before, employeeId, employeeLinkedBy: "owner" as const };
  await accounts.update(after);
  await history.append(ctx, tx, {
    recordType: "app_account",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: after.id, changes: accountChanges(before, after) }],
  });
  const suspended = await findEmployeesInDirectory(tx, dependencies.connectors, {
    status: "suspended",
    among: [employeeId],
  });
  return toAppUser({ ...after, inApp }, new Set(suspended));
}
