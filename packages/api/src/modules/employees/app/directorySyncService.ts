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
      const known = await repository.lockByEmails(emailsNamedBy(people));
      const knownEmails = new Set(known.map(({ email }) => email));
      const created = await repository.insertMany(
        people
          .filter(({ email }) => !knownEmails.has(email))
          .map(({ email, firstName, lastName }) => ({ email, firstName, lastName })),
      );
      const employees = [...known, ...created];
      const links: DirectoryLinks = {
        idsByEmail: new Map(employees.map(({ email, id }) => [email, id])),
        owner: await unlinkedOwner(repository, tx),
      };
      const saved = await saveDirectoryFields(repository, employees, people, links);
      const managerNames = await namesOfManagers(repository, employees, saved);
      await recordChanges(ctx, tx, { created, saved, managerNames, cause });
      return new Map(people.map(({ email }) => [email, links.idsByEmail.get(email)!]));
    },
  };
}

/** Every email the directory names: its people's and their managers'. */
function emailsNamedBy(people: readonly DirectoryPerson[]): string[] {
  const managers = people.flatMap(({ managerEmail }) => (managerEmail ? [managerEmail] : []));
  return [...new Set([...people.map(({ email }) => email), ...managers])];
}

/** The owner while no employee is linked to their user yet, else null: one user, one employee. */
async function unlinkedOwner(
  repository: EmployeeRepository,
  tx: Tx,
): Promise<DirectoryLinks["owner"]> {
  const owner = await owners.readOwner(tx);
  return owner && !(await repository.findByUserId(owner.userId)) ? owner : null;
}

// shortcut: one update per changed employee, so a first scan of a directory of thousands writes
// each manager on its own; batch the updates if very large directories come (out of circle 1).
/** Saves each listed employee's directory fields that changed; returns them before and after. */
async function saveDirectoryFields(
  repository: EmployeeRepository,
  employees: readonly Employee[],
  people: readonly DirectoryPerson[],
  links: DirectoryLinks,
): Promise<EmployeeChange[]> {
  const byEmail = new Map(employees.map((employee) => [employee.email, employee]));
  const saved: EmployeeChange[] = [];
  for (const person of people) {
    const before = byEmail.get(person.email)!;
    const after = employeeFromDirectory(before, person, links);
    const { firstName, lastName, managerId, userId } = after;
    const changed =
      firstName !== before.firstName ||
      lastName !== before.lastName ||
      managerId !== before.managerId ||
      userId !== before.userId;
    if (changed) {
      await repository.saveDirectoryFields(before.id, { firstName, lastName, managerId, userId });
      saved.push({ before, after });
    }
  }
  return saved;
}

/**
 * Each manager's name before the sync, including a previous manager the directory no longer
 * lists, and after it, for the labels of manager changes.
 */
async function namesOfManagers(
  repository: EmployeeRepository,
  employees: readonly Employee[],
  saved: readonly EmployeeChange[],
): Promise<{ before: Map<string, string>; after: Map<string, string> }> {
  const loaded = new Set(employees.map(({ id }) => id));
  const outside = new Set(
    saved.flatMap(({ before }) =>
      before.managerId && !loaded.has(before.managerId) ? [before.managerId] : [],
    ),
  );
  const previousManagers = outside.size > 0 ? await repository.findByIds([...outside]) : [];
  const before = namesById([...employees, ...previousManagers]);
  return { before, after: new Map([...before, ...namesById(saved.map(({ after }) => after))]) };
}

/** One history line per created employee, holding its final fields, and per updated one. */
async function recordChanges(
  ctx: SecurityContext,
  tx: Tx,
  {
    created,
    saved,
    managerNames,
    cause,
  }: {
    created: readonly Employee[];
    saved: readonly EmployeeChange[];
    managerNames: { before: Map<string, string>; after: Map<string, string> };
    cause: HistoryAppend["cause"];
  },
): Promise<void> {
  const savedById = new Map(saved.map((change) => [change.after.id, change]));
  const createdIds = new Set(created.map(({ id }) => id));
  const lines = [
    {
      operation: "CREATED" as const,
      records: created.map((employee) => ({
        recordId: employee.id,
        changes: directoryChanges(
          null,
          savedById.get(employee.id)?.after ?? employee,
          managerNames,
        ),
      })),
    },
    {
      operation: "UPDATED" as const,
      records: saved
        .filter(({ after }) => !createdIds.has(after.id))
        .map(({ before, after }) => ({
          recordId: after.id,
          changes: directoryChanges(before, after, managerNames),
        })),
    },
  ];
  for (const { operation, records } of lines) {
    if (records.length > 0) {
      await recordHistory.append(ctx, tx, { recordType: "employee", operation, cause, records });
    }
  }
}

interface EmployeeChange {
  before: Employee;
  after: Employee;
}

function namesById(employees: readonly Employee[]): Map<string, string> {
  return new Map(employees.map(({ id, firstName, lastName }) => [id, `${firstName} ${lastName}`]));
}
