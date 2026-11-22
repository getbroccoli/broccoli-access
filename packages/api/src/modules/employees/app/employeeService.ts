import { invalidInput } from "../../../core/applicationError";
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
import { readableResult } from "./readableResult";
import { recordCreatedEmployees } from "./recordCreatedEmployees";

const recordHistory = createRecordHistoryService();

/** Adds and changes employees, each in one transaction with its history lines. */
export interface EmployeeService {
  /** Adds an employee; returns null when the caller may not read them. */
  createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) => Promise<Employee | null>;
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
}: Pick<ModuleDependencies, "transact" | "logger">): EmployeeService {
  return {
    async createEmployee(ctx, input) {
      ctx.requireEveryRecord("employee", "create");
      const newEmployee = parseNewEmployee(input);
      try {
        const employee = await transact(async (tx) => {
          const employee = await employeeRepository(tx).insert(newEmployee);
          await recordCreatedEmployees(ctx, tx, [employee], { kind: "EDITED_DIRECTLY" });
          return employee;
        });
        return (await readableResult(ctx, employee, null)).employee;
      } catch (error) {
        if (error instanceof EmailTakenError) {
          throw invalidInput([{ field: "email", code: "taken" }]);
        }
        throw error;
      }
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
