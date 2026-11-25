import { ApplicationError, invalidInput } from "../../../core/applicationError";
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
import {
  type AppAccount,
  accountChanges,
  employeeMatcher,
  isAutomaticService,
  parseAccountNote,
} from "../domain";
import type { ConnectionMembers, EmployeesByName } from "../ports";
import { type AppUser, toAppUser } from "./appUserService";
import { findInAppFacts } from "./inAppFacts";
import { type DirectoryConnectors, findEmployeesInDirectory } from "./directory";
import { loggingRefusal } from "./loggingRefusal";

/** The owner's decisions on unlinked accounts in approved apps. */
export interface AccountLinkService {
  listAccountsWithoutPerson: (
    ctx: SecurityContext,
    page: PageArgs,
  ) => Promise<Connection<AccountWithoutPerson>>;
  listMarkedAccounts: (ctx: SecurityContext, page: PageArgs) => Promise<Connection<MarkedAccount>>;
  markAccount: (
    ctx: SecurityContext,
    input: MarkInput & { kind: MarkKind },
  ) => Promise<MarkedAccount>;
  editAccountNote: (ctx: SecurityContext, input: MarkInput) => Promise<MarkedAccount>;
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
  status: AppAccount["status"];
  displayName: string | null;
  suggestedEmployeeId: string | null;
}

type MarkKind = Exclude<AppAccount["kind"], "personal">;
type MarkInput = { appAccountId: string; note: string };

export interface MarkedAccount {
  id: string;
  app: App;
  email: string;
  kind: MarkKind;
  note: string | null;
  canEdit: boolean;
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
      const page = await listPage(dependencies, args, "personal");
      if (!page.edges.length) return { ...page, edges: [] };
      const [names, directoryEmployeeIds] = await Promise.all([
        readMemberNames(
          dependencies,
          page.edges.map(({ node }) => node),
        ),
        findEmployeesInDirectory(orm, dependencies.connectors),
      ]);
      const suggest = employeeMatcher(await employees.readEmployees(ctx, directoryEmployeeIds));
      return {
        ...page,
        edges: page.edges.map(({ cursor, node: { id, app, email, status, connectionId } }) => {
          const displayName = names.get(`${connectionId} ${email}`) ?? null;
          return {
            cursor,
            node: {
              id,
              app,
              appId: app.id,
              email,
              status,
              displayName,
              suggestedEmployeeId: suggest({ email, displayName }),
            },
          };
        }),
      };
    },
    async listMarkedAccounts(ctx, args) {
      requireOwner(ctx);
      // shortcut: People shows the last scan’s attribution until another scan applies an identity change.
      const page = await listPage(dependencies, args, "marked");
      return {
        ...page,
        edges: page.edges.map(({ cursor, node }) => ({
          cursor,
          node: markedAccount(node),
        })),
      };
    },
    markAccount: (ctx, input) =>
      loggingRefusal(logger, refusalOf("App account mark refused", input), () =>
        saveMark(dependencies, ctx, input),
      ),
    editAccountNote: (ctx, input) =>
      loggingRefusal(logger, refusalOf("App account note edit refused", input), () =>
        saveMark(dependencies, ctx, input),
      ),
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

async function listPage(
  dependencies: AccountLinkDependencies,
  args: PageArgs,
  group: "personal" | "marked",
) {
  const { orm } = dependencies;
  const facts = await findInAppFacts(orm, dependencies);
  return paginate(args, {
    order: { field: "EMAIL", direction: "ASC" },
    keysetValues: UNLINKED_SORT_VALUES,
    fetch: (query) => appAccountRepository(orm).findUnlinkedAccounts(query, facts, group),
  });
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
  const { before, inApp } = await lockUnlinkedAccount(dependencies, tx, appAccountId);
  if (before.kind !== "personal")
    throw new ApplicationError("CONFLICT", "This account is no longer available to link.");
  const after = { ...before, employeeId, employeeLinkedBy: "owner" as const };
  await updateAccount(ctx, tx, before, after);
  const suspended = await findEmployeesInDirectory(tx, dependencies.connectors, {
    status: "suspended",
    among: [employeeId],
  });
  return toAppUser({ ...after, inApp }, new Set(suspended));
}

async function lockUnlinkedAccount(dependencies: AccountLinkDependencies, tx: Tx, id: string) {
  const accounts = appAccountRepository(tx);
  // Match scans' lock order so a concurrent scan cannot undo the decision.
  await accounts.lockForSync();
  const facts = await findInAppFacts(tx, dependencies);
  const locked = await accounts.lockById(id, facts);
  if (!locked) throw new ApplicationError("NOT_FOUND", "No app account has this id.");
  const { inApp, ...before } = locked;
  const app = await appRepository(tx).lockById(before.appId);
  if (app?.status !== "approved" || before.employeeId !== null || inApp === false) {
    throw new ApplicationError("CONFLICT", "This account is no longer available.");
  }
  return { before, inApp, app };
}

function refusalOf(message: string, { appAccountId, kind }: MarkInput & { kind?: MarkKind }) {
  return { message, ids: { appAccountId: parseUuid(appAccountId), kind: kind ?? null } };
}

async function saveMark(
  dependencies: AccountLinkDependencies,
  ctx: SecurityContext,
  input: MarkInput & { kind?: MarkKind },
) {
  requireOwner(ctx);
  const id = parseUuid(input.appAccountId);
  if (!id) throw new ApplicationError("NOT_FOUND", "No app account has this id.");
  const parsed = parseAccountNote(input.note);
  if ("problem" in parsed) throw invalidInput([{ field: "note", code: parsed.problem }]);
  const { note } = parsed;
  const account = await dependencies.transact(async (tx) => {
    const { before, app } = await lockUnlinkedAccount(dependencies, tx, id);
    const marking = input.kind !== undefined;
    if (
      marking
        ? before.kind !== "personal"
        : before.kind === "personal" || isAutomaticService(before)
    ) {
      throw new ApplicationError(
        "CONFLICT",
        "This account is no longer available to mark or edit.",
      );
    }
    const after = { ...before, kind: input.kind ?? before.kind, note };
    await updateAccount(ctx, tx, before, after);
    return markedAccount({ ...after, app });
  });
  dependencies.logger.info(
    { appAccountId: id, kind: account.kind },
    input.kind ? "App account marked" : "App account note edited",
  );
  return account;
}

async function updateAccount(ctx: SecurityContext, tx: Tx, before: AppAccount, after: AppAccount) {
  const changes = accountChanges(before, after);
  if (!changes.length) return;
  await appAccountRepository(tx).update(after);
  await history.append(ctx, tx, {
    recordType: "app_account",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: after.id, changes }],
  });
}

function markedAccount({
  id,
  email,
  app,
  kind,
  note,
}: Pick<UnlinkedAccount, "id" | "email" | "app" | "kind" | "note">): MarkedAccount {
  if (kind === "personal") throw new Error("Expected a marked account.");
  const managed = isAutomaticService({ kind, note });
  return { id, app, email, kind, note: managed ? "Integration user" : note, canEdit: !managed };
}
