import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService, type HistoryLine } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { type EmployeeRepository, employeeRepository } from "../db";
import {
  EmailTakenError,
  type Employee,
  employeeChanges,
  type EmployeeUpdateInput,
  type NewEmployee,
  type NewEmployeeInput,
  parseEmployeeUpdate,
  parseNewEmployee,
} from "../domain";
import { employeeNotFound } from "./employeeNotFound";
import type { ReadPeopleAwaitingDirectory } from "./peopleAwaitingDirectory";
import { readableResult } from "./readableResult";
import { recordCreatedEmployees } from "./recordCreatedEmployees";

const recordHistory = createRecordHistoryService();

/** Adds and changes employees, each in one transaction with its history lines. */
export interface EmployeeService {
  /** Adds an employee; returns null when the caller may not read them. */
  createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) => Promise<Employee | null>;
  /** Saves an owner-added person with the directory connection in their creation history. */
  createPersonAwaitingDirectory: (
    ctx: SecurityContext,
    tx: Tx,
    input: NewEmployeeInput,
    directoryConnectionId: string,
  ) => Promise<Employee>;
  /** Deletes an employee in the transaction that verified whether they can be deleted. */
  deleteEmployee: (ctx: SecurityContext, id: string, tx: Tx) => Promise<void>;
  /** The named employees whose reports still link to them. */
  findManagersWithReports: (db: Orm | Tx, ids: readonly string[]) => Promise<Set<string>>;
  /**
   * Changes the fields an update sends and records the change in the employee's history, and
   * returns the line. A save that changes nothing records nothing; the last save of a field wins.
   * Refuses an unknown id with NOT_FOUND. The employee and line are null when the caller may not
   * read the employee.
   */
  updateEmployee: (
    ctx: SecurityContext,
    input: EmployeeUpdateInput & { id: string },
  ) => Promise<{ employee: Employee | null; historyLine: HistoryLine | null }>;
}

export function createEmployeeService({
  transact,
  logger,
  findPeopleAwaitingDirectory,
}: Pick<ModuleDependencies, "transact" | "logger"> & {
  findPeopleAwaitingDirectory: ReadPeopleAwaitingDirectory;
}): EmployeeService {
  return {
    async createEmployee(ctx, input) {
      const employee = await transact((tx) => addEmployee(ctx, tx, input));
      return (await readableResult(ctx, employee, null)).employee;
    },
    createPersonAwaitingDirectory(ctx, tx, input, directoryConnectionId) {
      if (!ctx.user?.isOwner)
        throw new ApplicationError("FORBIDDEN", "Only the owner can add a person.");
      return addEmployee(ctx, tx, input, directoryConnectionId);
    },
    findManagersWithReports: (db, ids) => employeeRepository(db).findManagersWithReports(ids),
    async deleteEmployee(ctx, id, tx) {
      await ctx.requireInScope("employee", "delete", id);
      const employees = employeeRepository(tx);
      const employee = await employees.lockById(id);
      if (!employee) throw employeeNotFound();
      await recordHistory.append(ctx, tx, {
        recordType: "employee",
        operation: "DELETED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [{ recordId: id, changes: employeeChanges(employee, null) }],
      });
      if (employee.avatarFileId) await employees.replaceAvatar(employee, null);
      await employees.delete(id);
    },
    async updateEmployee(ctx, { id, ...input }) {
      const employeeId = parseUuid(id);
      if (!employeeId) {
        ctx.requireEveryRecord("employee", "update");
        throw employeeNotFound();
      }
      await ctx.requireWrite("employee", [employeeId], fieldsSent(input));
      const { changes, reason } = parseEmployeeUpdate(input);
      const { employee, historyLine } = await transact(async (tx) => {
        await refuseChangingPendingEmail(
          tx,
          employeeId,
          changes.email,
          findPeopleAwaitingDirectory,
        );
        const { before, after } = await saveChanges(employeeRepository(tx), employeeId, changes);
        const changed = employeeChanges(before, after);
        if (changed.length === 0) {
          return { employee: after, historyLine: null };
        }
        const [line] = await recordHistory.append(ctx, tx, {
          recordType: "employee",
          operation: "UPDATED",
          cause: { kind: "EDITED_DIRECTLY" },
          reason,
          records: [{ recordId: employeeId, changes: changed }],
        });
        return { employee: after, historyLine: line! };
      });
      if (historyLine) {
        logger.info(
          { employeeId, historyId: historyLine.id, fields: fieldsOf(historyLine) },
          "Updated an employee",
        );
      }
      return readableResult(ctx, employee, historyLine);
    },
  };
}

async function addEmployee(
  ctx: SecurityContext,
  tx: Tx,
  input: NewEmployeeInput,
  directoryConnectionId?: string,
) {
  ctx.requireEveryRecord("employee", "create");
  const newEmployee = parseNewEmployee(input);
  const employee = await employeeRepository(tx)
    .insert(newEmployee)
    .catch((error: unknown) => {
      if (error instanceof EmailTakenError) throw invalidInput([{ field: "email", code: "taken" }]);
      throw error;
    });
  await recordCreatedEmployees(ctx, tx, [employee], {
    kind: "EDITED_DIRECTLY",
    ref: directoryConnectionId,
  });
  return employee;
}

async function refuseChangingPendingEmail(
  tx: Tx,
  employeeId: string,
  email: string | undefined,
  findPeopleAwaitingDirectory: ReadPeopleAwaitingDirectory,
) {
  if (email === undefined || !(await findPeopleAwaitingDirectory(tx, [employeeId])).has(employeeId))
    return;
  const employee = await employeeRepository(tx).findById(employeeId);
  if (employee && employee.email !== email) {
    throw new ApplicationError(
      "CONFLICT",
      "The work email can be changed after the directory scan finds this person.",
    );
  }
}

/** The employee before and after saving `changes`; refuses an unknown employee or a taken email. */
async function saveChanges(
  employees: EmployeeRepository,
  employeeId: string,
  changes: Partial<NewEmployee>,
): Promise<{ before: Employee; after: Employee }> {
  if (Object.keys(changes).length === 0) {
    const employee = await employees.findById(employeeId);
    if (!employee) {
      throw employeeNotFound();
    }
    return { before: employee, after: employee };
  }
  try {
    const saved = await employees.update(employeeId, changes);
    if (!saved) {
      throw employeeNotFound();
    }
    return saved;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      throw invalidInput([{ field: "email", code: "taken" }]);
    }
    throw error;
  }
}

/** The fields an update sends, by their input names; the reason is not a field. */
function fieldsSent(input: EmployeeUpdateInput): string[] {
  return Object.entries(input)
    .filter(([field, value]) => field !== "changeReason" && value !== undefined)
    .map(([field]) => field);
}

function fieldsOf(line: HistoryLine): string[] {
  return line.changes.map(({ field }) => field);
}
