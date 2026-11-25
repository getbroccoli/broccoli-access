import { createFileStorageService, type StoredFile } from "../../../core/files";
import { ApplicationError } from "../../../core/applicationError";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import {
  type Connection,
  type ListArgs,
  type PageArgs,
  paginate,
  parseSearch,
} from "../../../core/pagination";
import { createRecordHistoryReaderService, type HistoryLine } from "../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import type { Orm, Tx } from "../../../core/db";
import { EMPLOYEE_SORT_VALUES, employeeRepository } from "../db";
import {
  accessOfEmployees,
  type Employee,
  type EmployeeAccess,
  type EmployeeOrder,
  type EmployeeOrderField,
  NO_ACCESS,
} from "../domain";
import type { EmployeeAccounts } from "../ports";
import { employeeRecordType } from "./employeeRecordType";

const fileStorage = createFileStorageService();

export interface EmployeeListArgs extends ListArgs<EmployeeOrderField> {
  /** `suspendedWithAccess: true` keeps only the people suspended with access. */
  filter?: { search?: string | null; suspendedWithAccess?: boolean | null } | null;
}

/** Reads employees, their history and avatars, as far as the caller may read them. */
export interface EmployeeReadService {
  /** Hold the referenced people before taking app locks, in directory sync order. */
  holdForReference(tx: Tx, ids: readonly string[]): Promise<void>;
  /** The employee with this id, or null when there is none. */
  readEmployee: (ctx: SecurityContext, id: string) => Promise<Employee | null>;
  /** The employees with these ids the caller may read, sorted by name; an unknown id is left out. */
  readEmployees: (
    ctx: SecurityContext,
    ids: readonly string[],
    db?: Orm | Tx,
  ) => Promise<Employee[]>;
  /** The employees the caller may read, keyed by their linked app account. */
  readAccountOwners: (
    ctx: SecurityContext,
    accountIds: readonly string[],
  ) => Promise<Map<string, Employee>>;
  /** The employees with these lowercased emails the caller may read; an email nobody has is left out. */
  readEmployeesByEmails: (
    ctx: SecurityContext,
    emails: readonly string[],
    db?: Orm | Tx,
  ) => Promise<Employee[]>;
  /** The signed-in user's own employee; null for a user without one, such as the owner. */
  readMyEmployee: (ctx: SecurityContext) => Promise<Employee | null>;
  /**
   * The employees the caller may read, sorted by name unless ordered otherwise and filtered, one
   * page at a time. The STATUS order and the `suspendedWithAccess` filter need MANAGE_WORKSPACE.
   */
  listEmployees: (ctx: SecurityContext, args: EmployeeListArgs) => Promise<Connection<Employee>>;
  /** How many employees there are, and how many are suspended with access. Needs MANAGE_WORKSPACE. */
  countEmployees: (ctx: SecurityContext) => Promise<{ all: number; suspendedWithAccess: number }>;
  /** Each employee's status and apps, one per id in order. Needs MANAGE_WORKSPACE. */
  readAccessOfEmployees: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ) => Promise<EmployeeAccess[]>;
  /** An employee's history, newest first, also after the employee is deleted; read as `recordHistory` reads it. */
  readEmployeeHistory: (
    ctx: SecurityContext,
    employeeId: string,
    args: PageArgs,
  ) => Promise<Connection<HistoryLine>>;
  /** The avatar file with this id, or null when it is no employee's avatar. */
  readAvatar: (ctx: SecurityContext, fileId: string) => Promise<StoredFile | null>;
}

export function createEmployeeReadService({
  orm,
  accounts,
}: Pick<ModuleDependencies, "orm"> & { accounts: EmployeeAccounts }): EmployeeReadService {
  const employees = employeeRepository(orm);
  const readAccess = (ctx: SecurityContext) => readAccessOfEveryone(ctx, orm, accounts);
  const history = createRecordHistoryReaderService(orm, { employee: employeeRecordType(orm) });
  const readEmployees: EmployeeReadService["readEmployees"] = async (ctx, ids, db = orm) =>
    readableOf(ctx, await employeeRepository(db).findByIds(ids));
  return {
    holdForReference: (tx, ids) => employeeRepository(tx).holdForReference(ids),
    async readEmployee(ctx, id) {
      const employeeId = parseUuid(id);
      if (!employeeId) {
        ctx.requireEveryRecord("employee", "read");
        return null;
      }
      await ctx.requireInScope("employee", "read", employeeId);
      return employees.findById(employeeId);
    },
    readEmployees,
    async readAccountOwners(ctx, ids) {
      ctx.require("MANAGE_WORKSPACE");
      const links = await accounts.findAccountOwners(orm, ids);
      const found = await readEmployees(
        ctx,
        links.flatMap(({ employeeId }) => employeeId ?? []),
      );
      const byId = new Map(found.map((person) => [person.id, person]));
      return new Map(
        links.flatMap(({ id, employeeId }) => {
          const person = employeeId && byId.get(employeeId);
          return person ? [[id, person] as const] : [];
        }),
      );
    },
    readEmployeesByEmails: async (ctx, emails, db = orm) =>
      readableOf(ctx, await employeeRepository(db).findByEmails(emails)),
    async readMyEmployee(ctx) {
      const employeeId = ctx.user?.employeeId;
      return employeeId ? employees.findById(employeeId) : null;
    },
    async listEmployees(ctx, { filter, ...listArgs }) {
      const scope = await ctx.recordScope("employee", "read");
      const search = parseSearch(filter?.search);
      const onlySuspendedWithAccess = filter?.suspendedWithAccess === true;
      const readsAccess = onlySuspendedWithAccess || listArgs.orderBy?.field === "STATUS";
      const access = readsAccess ? await readAccess(ctx) : new Map<string, EmployeeAccess>();
      const suspendedIds = idsWhere(access, isSuspended);
      const employeeIds = onlySuspendedWithAccess ? idsWhere(access, isSuspendedWithAccess) : null;
      return paginate(listArgs, {
        order: DEFAULT_ORDER,
        keysetValues: EMPLOYEE_SORT_VALUES,
        fetch: (query) =>
          employees.findPage({ ...query, search, scope, employeeIds, suspendedIds }),
      });
    },
    async countEmployees(ctx) {
      const access = await readAccess(ctx);
      return {
        all: await employees.count(),
        suspendedWithAccess: idsWhere(access, isSuspendedWithAccess).length,
      };
    },
    async readAccessOfEmployees(ctx, employeeIds) {
      const access = await readAccess(ctx);
      return employeeIds.map((id) => access.get(id) ?? NO_ACCESS);
    },
    readEmployeeHistory: (ctx, employeeId, args) =>
      history.readHistory(ctx, "employee", employeeId, args),
    async readAvatar(ctx, fileId) {
      const id = parseUuid(fileId);
      const employeeIds = id ? await employees.findIdsByAvatar(id) : [];
      if (!id || employeeIds.length === 0) {
        ctx.requireEveryRecord("employee", "read");
        return null;
      }
      // Imported people can share a photo: any of them in scope makes it readable.
      const scope = await ctx.recordScope("employee", "read");
      if (!employeeIds.some((employeeId) => isInRecordScope(scope, employeeId))) {
        throw new ApplicationError("FORBIDDEN", "You are not allowed to do this.");
      }
      return fileStorage.readFile(orm, id);
    },
  };
}

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

/** Those of the employees the caller may read. */
async function readableOf(ctx: SecurityContext, found: Employee[]): Promise<Employee[]> {
  const scope = await ctx.recordScope("employee", "read");
  return found.filter(({ id }) => isInRecordScope(scope, id));
}

/** Every employee's access, which only an admin may read. */
// shortcut: reads every employee's accounts for each call; fine for circle 1's directories, read
// by employee ids when very large directories come.
async function readAccessOfEveryone(
  ctx: SecurityContext,
  orm: Orm,
  accounts: EmployeeAccounts,
): Promise<Map<string, EmployeeAccess>> {
  ctx.require("MANAGE_WORKSPACE");
  return accessOfEmployees(await accounts.findEmployeeAccounts(orm));
}

const isSuspended = ({ status }: EmployeeAccess) => status === "suspended";

const isSuspendedWithAccess = ({ suspendedWithAccess }: EmployeeAccess) => suspendedWithAccess;

function idsWhere(
  access: ReadonlyMap<string, EmployeeAccess>,
  holds: (access: EmployeeAccess) => boolean,
): string[] {
  return [...access].filter(([, employeeAccess]) => holds(employeeAccess)).map(([id]) => id);
}
