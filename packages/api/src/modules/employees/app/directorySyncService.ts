import type { Tx } from "../../../core/db";
import { createOwnerService } from "../../../core/instance";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { type EmployeeRepository, employeeRepository } from "../db";
import {
  directoryChanges,
  type DirectoryLinks,
  type DirectoryPerson,
  type Employee,
  employeeFromDirectory,
} from "../domain";

const owners = createOwnerService();
const recordHistory = createRecordHistoryService();

/** Employees kept in step with the directory app's accounts. */
export interface DirectorySyncService {
  /**
   * Creates the employees the directory lists and nobody has the email of, updates the names and
   * managers of the others, and links the owner's user to their employee, joining `tx`; appends
   * the history of each change with `cause`. Employees the directory no longer lists stay as they
   * are. Returns each listed email's employee id. System only.
   */
  syncDirectoryPeople: (
    ctx: SecurityContext,
    tx: Tx,
    people: readonly DirectoryPerson[],
    cause: HistoryAppend["cause"],
  ) => Promise<Map<string, string>>;
}

export function createDirectorySyncService(): DirectorySyncService {
  return {
    async syncDirectoryPeople(ctx, tx, people, cause) {
      ctx.requireSystem();
      const repository = employeeRepository(tx);
      const known = await repository.findByEmails(emailsNamedBy(people));
      const knownEmails = new Set(known.map(({ email }) => email));
      const created = await repository.insertMany(
        people
          .filter(({ email }) => !knownEmails.has(email))
          .map(({ email, firstName, lastName }) => ({ email, firstName, lastName })),
      );
      const employees = [...known, ...created];
      const links: DirectoryLinks = {
        idsByEmail: new Map(employees.map(({ email, id }) => [email, id])),
        owner: await owners.readOwner(tx),
      };
      const saved = await saveDirectoryFields(repository, employees, people, links);
      await recordChanges(ctx, tx, { created, saved, employees, cause });
      return new Map(people.map(({ email }) => [email, links.idsByEmail.get(email)!]));
    },
  };
}

/** Every email the directory names: its people's and their managers'. */
function emailsNamedBy(people: readonly DirectoryPerson[]): string[] {
  const managers = people.flatMap(({ managerEmail }) => (managerEmail ? [managerEmail] : []));
  return [...new Set([...people.map(({ email }) => email), ...managers])];
}

// shortcut: one update per changed employee, so a first scan of a large directory writes each
// manager on its own; write them in one statement if directories of thousands come.
/** Saves each listed employee's directory fields that changed; returns them before and after. */
async function saveDirectoryFields(
  repository: EmployeeRepository,
  employees: readonly Employee[],
  people: readonly DirectoryPerson[],
  links: DirectoryLinks,
): Promise<{ before: Employee; after: Employee }[]> {
  const byEmail = new Map(employees.map((employee) => [employee.email, employee]));
  const saved: { before: Employee; after: Employee }[] = [];
  for (const person of people) {
    const employee = byEmail.get(person.email)!;
    const { firstName, lastName, managerId, userId } = employeeFromDirectory(
      employee,
      person,
      links,
    );
    const changed =
      firstName !== employee.firstName ||
      lastName !== employee.lastName ||
      managerId !== employee.managerId ||
      userId !== employee.userId;
    if (changed) {
      const result = await repository.update(employee.id, {
        firstName,
        lastName,
        managerId,
        userId,
      });
      saved.push(result!);
    }
  }
  return saved;
}

/** One history line per created employee, holding its final fields, and per updated one. */
async function recordChanges(
  ctx: SecurityContext,
  tx: Tx,
  {
    created,
    saved,
    employees,
    cause,
  }: {
    created: readonly Employee[];
    saved: readonly { before: Employee; after: Employee }[];
    employees: readonly Employee[];
    cause: HistoryAppend["cause"];
  },
): Promise<void> {
  const namesById = new Map(
    employees.map(({ id, firstName, lastName }) => [id, `${firstName} ${lastName}`]),
  );
  const savedById = new Map(saved.map((change) => [change.after.id, change]));
  const createdIds = new Set(created.map(({ id }) => id));
  const lines = [
    {
      operation: "CREATED" as const,
      records: created.map((employee) => ({
        recordId: employee.id,
        changes: directoryChanges(null, savedById.get(employee.id)?.after ?? employee, namesById),
      })),
    },
    {
      operation: "UPDATED" as const,
      records: saved
        .filter(({ after }) => !createdIds.has(after.id))
        .map(({ before, after }) => ({
          recordId: after.id,
          changes: directoryChanges(before, after, namesById),
        })),
    },
  ];
  for (const { operation, records } of lines) {
    if (records.length > 0) {
      await recordHistory.append(ctx, tx, { recordType: "employee", operation, cause, records });
    }
  }
}
