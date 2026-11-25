import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { appAccountRepository, appRepository, directoryChangeRepository } from "../db";
import type { AccountChange } from "../domain";
import { type DirectoryConnectors, findDirectoryConnection } from "./directory";
import { loggingRefusal } from "./loggingRefusal";

export interface AddPersonService {
  addPerson(ctx: SecurityContext, input: AddPersonInput): Promise<{ id: string }>;
  deletePerson(ctx: SecurityContext, employeeId: string): Promise<void>;
  readDirectoryProvisions(
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ): Promise<(DirectoryProvision | null)[]>;
}

interface AddPersonInput {
  firstName: string;
  lastName: string;
  email: string;
  templateIds: readonly string[];
}

interface DirectoryProvision {
  status: AccountChange["status"] | null;
  failure: AccountChange["error"];
  canDelete: boolean;
  firstPasswordAvailable: boolean;
}

interface Dependencies extends Pick<ModuleDependencies, "orm" | "transact" | "logger"> {
  employees: {
    createPersonAwaitingDirectory(
      ctx: SecurityContext,
      tx: Tx,
      input: AddPersonInput,
      directoryConnectionId: string,
    ): Promise<{ id: string; email: string }>;
    deleteEmployee(ctx: SecurityContext, id: string, tx: Tx): Promise<void>;
    readEmployees(
      ctx: SecurityContext,
      ids: readonly string[],
      db: Orm | Tx,
    ): Promise<readonly { id: string }[]>;
    findPeopleAwaitingDirectory(db: Orm | Tx, ids: readonly string[]): Promise<Set<string>>;
    findManagersWithReports(db: Orm | Tx, ids: readonly string[]): Promise<Set<string>>;
  };
  templates: {
    prepareNewPersonAssignments(
      ctx: SecurityContext,
      tx: Tx,
      templateIds: readonly string[],
    ): Promise<{ appIds: string[]; assign: (employeeId: string) => Promise<void> }>;
  };
  directoryConnectors: DirectoryConnectors;
}

export function createAddPersonService(dependencies: Dependencies): AddPersonService {
  const { transact, orm, employees, logger } = dependencies;
  return {
    async addPerson(ctx, input) {
      const id = await loggingRefusal(logger, { message: "Add person refused", ids: {} }, () =>
        savePerson(dependencies, ctx, input),
      );
      logger.info({ employeeId: id }, "Person added");
      return { id };
    },
    async deletePerson(ctx, employeeId) {
      const id = parseUuid(employeeId);
      await loggingRefusal(
        logger,
        { message: "Delete person refused", ids: { employeeId: id } },
        async () => {
          requirePersonOwner(ctx);
          await transact(async (tx) => {
            await appAccountRepository(tx).lockForSync();
            if (!id || !(await employees.readEmployees(ctx, [id], tx)).length) {
              throw new ApplicationError("NOT_FOUND", "No employee has this id.");
            }
            const [provision] = await readDirectoryProvisions(dependencies, tx, [id]);
            if (provision?.status === "running") {
              throw new ApplicationError(
                "CONFLICT",
                "Wait for Google account creation to finish before deleting this person.",
              );
            }
            if (!provision?.canDelete) {
              throw new ApplicationError(
                "CONFLICT",
                "Only a person saved with Add person who has no linked accounts or reports and has never had a directory account can be deleted.",
              );
            }
            await employees.deleteEmployee(ctx, id, tx);
          });
        },
      );
      logger.info({ employeeId: id }, "Person deleted");
    },
    async readDirectoryProvisions(ctx, employeeIds) {
      if (ctx.user?.isOwner) return readDirectoryProvisions(dependencies, orm, employeeIds);
      if (!ctx.can("MANAGE_WORKSPACE")) return employeeIds.map(() => null);
      const pending = await employees.findPeopleAwaitingDirectory(orm, employeeIds);
      return employeeIds.map((id) =>
        pending.has(id)
          ? { status: null, failure: null, canDelete: false, firstPasswordAvailable: false }
          : null,
      );
    },
  };
}

async function savePerson(
  { transact, templates, employees, directoryConnectors }: Dependencies,
  ctx: SecurityContext,
  input: AddPersonInput,
): Promise<string> {
  requirePersonOwner(ctx);
  for (;;) {
    const saved = await transact(async (tx) => {
      const assignments = await templates.prepareNewPersonAssignments(ctx, tx, input.templateIds);
      await appAccountRepository(tx).lockForSync();
      for (const appId of assignments.appIds) {
        if (!(await appRepository(tx).tryLockForReview(appId))) return { blockedApp: appId };
      }
      const connection = await findDirectoryConnection(tx, directoryConnectors);
      const domain = connection?.settings.domain;
      if (!connection || typeof domain !== "string") {
        throw new ApplicationError("CONFLICT", "Google Workspace is not connected.");
      }
      const employee = await employees.createPersonAwaitingDirectory(ctx, tx, input, connection.id);
      if (employee.email.split("@").at(-1) !== domain.toLowerCase()) {
        throw invalidInput([{ field: "email", code: "wrong_domain" }]);
      }
      await assignments.assign(employee.id);
      return { id: employee.id };
    });
    const { blockedApp } = saved;
    if (blockedApp === undefined) return saved.id;
    // Scans take the account writer lock first. Wait for the app outside that lock and try again.
    await transact((tx) => appRepository(tx).lockForReview([blockedApp]));
  }
}

/** The directory's first password is accessible only for seven days after creation. */
export function firstPasswordCutoff(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export function requirePersonOwner(ctx: SecurityContext): void {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user?.isOwner) {
    throw new ApplicationError(
      "FORBIDDEN",
      "Only the owner can manage a person's directory account.",
    );
  }
}

async function readDirectoryProvisions(
  { directoryConnectors, employees }: Dependencies,
  db: Orm | Tx,
  employeeIds: readonly string[],
): Promise<(DirectoryProvision | null)[]> {
  const directory = await findDirectoryConnection(db, directoryConnectors);
  if (!directory) return employeeIds.map(() => null);
  const [pending, invites] = await Promise.all([
    employees.findPeopleAwaitingDirectory(db, employeeIds),
    directoryChangeRepository(db).findLatest(employeeIds, directory.id),
  ]);
  const [accountIds, managers] = await Promise.all([
    pending.size
      ? appAccountRepository(db).findEmployeeIdsWithStatus(null, null, [...pending])
      : [],
    employees.findManagersWithReports(db, [...pending]),
  ]);
  const linked = new Set(accountIds);
  const validSince = firstPasswordCutoff();
  return employeeIds.map((employeeId) => {
    const latest = invites.get(employeeId);
    const awaitingDirectory = pending.has(employeeId);
    const firstPasswordAvailable =
      latest?.status === "succeeded" &&
      latest.hasPassword &&
      latest.finishedAt !== null &&
      latest.finishedAt > validSince;
    if (!awaitingDirectory && !firstPasswordAvailable) return null;
    const status = latest?.status ?? null;
    return {
      status,
      failure: latest?.error ?? null,
      canDelete:
        awaitingDirectory &&
        !linked.has(employeeId) &&
        !managers.has(employeeId) &&
        (status === null || status === "failed"),
      firstPasswordAvailable,
    };
  });
}
