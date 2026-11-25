import { eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  afterKeyset,
  anyOf,
  insertBatches,
  containsPattern,
  isUniqueViolation,
  type KeysetOrder,
  keysetOrder,
  type Orm,
  ormOf,
  orderByKeyset,
  type Tx,
} from "../../../core/db";
import { createFileStorageService, type StoredFile } from "../../../core/files";
import { inRecordScope, type RecordScope } from "../../../core/security";
import type { KeysetQuery, KeysetRow } from "../../../core/pagination";
import {
  EmailTakenError,
  type Employee,
  type EmployeeOrder,
  type EmployeeOrderField,
  type NewEmployee,
} from "../domain";
import { employees } from "./employeesTable";

/** Employees stored in Postgres, through the pool or inside a transaction, which inserts need. */
export interface EmployeeRepository {
  /** Throws `EmailTakenError` when another employee has the email. */
  insert(newEmployee: EmployeeRow): Promise<Employee>;
  /** Deletes the employee after the caller has checked whether they may be deleted. */
  delete(id: string): Promise<void>;
  /** Inserts employees whose emails nobody has, as a sync found them. */
  insertMany(newEmployees: readonly NewEmployee[]): Promise<Employee[]>;
  /**
   * Changes an employee's fields under the row's lock and returns the employee before and after;
   * null when no employee has the id. Throws `EmailTakenError` like `insert`.
   */
  update(
    id: string,
    changes: Partial<NewEmployee>,
  ): Promise<{ before: Employee; after: Employee } | null>;
  /** Saves the fields an employee takes from the directory, without reading them first. */
  saveDirectoryFields(id: string, fields: DirectoryFields): Promise<void>;
  /**
   * Makes `photo` the employee's avatar, or removes it with null, and deletes the file it
   * replaces; returns the new avatar's file id.
   */
  replaceAvatar(
    employee: Pick<Employee, "id" | "avatarFileId">,
    photo: StoredFile | null,
  ): Promise<string | null>;
  findById(id: string): Promise<Employee | null>;
  lockById(id: string): Promise<Employee | null>;
  findManagersWithReports(ids: readonly string[]): Promise<Set<string>>;
  /** The employee linked to this user, or null. */
  findByUserId(userId: string): Promise<Employee | null>;
  /** The employees among these ids that exist, sorted by name as the employee list sorts them. */
  findByIds(ids: readonly string[]): Promise<Employee[]>;
  /** The employees with these lowercased emails. */
  findByEmails(emails: readonly string[]): Promise<Employee[]>;
  /** The employees with these lowercased emails, locked until the transaction ends. */
  holdForReference(ids: readonly string[]): Promise<void>;
  lockByEmails(emails: readonly string[]): Promise<Employee[]>;
  /** The employees whose avatar is this file. */
  findIdsByAvatar(fileId: string): Promise<string[]>;
  /** Up to `limit` employees after `after`, with their sort values as Postgres computed them. */
  findPage(query: EmployeePageQuery): Promise<KeysetRow<Employee, unknown[]>[]>;
  /** How many employees there are. */
  count(): Promise<number>;
}

const fileStorage = createFileStorageService();

/** The order of `findByIds`: by name, as the employee list sorts by default. */
const NAME_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

const EMAIL_UNIQUE_CONSTRAINT = "employees_email_unique";

// Postgres text cannot hold NUL, so a cursor with one is no cursor this API issued.
const sortText = z.string().refine((value) => !value.includes("\0"));

/** The sort values of an employee in each order, as `findPage` returns them. */
export const EMPLOYEE_SORT_VALUES: Record<EmployeeOrderField, z.ZodType<unknown[]>> = {
  NAME: z.tuple([sortText, sortText, z.uuid()]),
  EMAIL: z.tuple([sortText, z.uuid()]),
  STATUS: z.tuple([z.boolean(), sortText, sortText, z.uuid()]),
};

export interface EmployeePageQuery extends KeysetQuery<EmployeeOrderField, unknown[]> {
  /** Trimmed and non-blank, or null for no filter. */
  search: string | null;
  /** The employees the caller may read; `inRecordScope` refuses "none". */
  scope: RecordScope;
  /** Only these employees, or null for every one. */
  employeeIds: readonly string[] | null;
  /** The employees suspended in the directory, whom the STATUS order puts first. */
  suspendedIds: readonly string[];
}

export function employeeRepository(db: Orm | Tx): EmployeeRepository {
  const orm = () => ormOf(db);

  return {
    insert: async (newEmployee) => {
      try {
        const [employee] = await orm().insert(employees).values(newEmployee).returning();
        return employee!;
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
    },

    insertMany: async (newEmployees) => {
      const inserted: Employee[] = [];
      for (const batch of insertBatches(newEmployees)) {
        inserted.push(...(await orm().insert(employees).values(batch).returning()));
      }
      return inserted;
    },

    delete: async (id) => {
      await orm().delete(employees).where(eq(employees.id, id));
    },
    lockById: async (id) => {
      const [employee] = await orm()
        .select()
        .from(employees)
        .where(eq(employees.id, id))
        .for("update");
      return employee ?? null;
    },
    findManagersWithReports: async (ids) => {
      if (!ids.length) return new Set();
      const rows = await orm()
        .selectDistinct({ id: employees.managerId })
        .from(employees)
        .where(anyOf(employees.managerId, ids));
      return new Set(rows.map(({ id }) => id!));
    },

    update: async (id, changes) => {
      // Locked before it is read, so the read sees a change committed while it waited.
      await orm()
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, id))
        .for("update");
      const [before] = await orm().select().from(employees).where(eq(employees.id, id));
      if (!before) {
        return null;
      }
      try {
        await orm().update(employees).set(changes).where(eq(employees.id, id));
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
      // The changes are normalised as stored, so the stored employee is the old one with them.
      return { before, after: { ...before, ...changes } };
    },

    saveDirectoryFields: async (id, fields) => {
      await orm().update(employees).set(fields).where(eq(employees.id, id));
    },

    replaceAvatar: async ({ id, avatarFileId }, photo) => {
      const newFileId = photo && (await fileStorage.storeFile(db, photo));
      await orm().update(employees).set({ avatarFileId: newFileId }).where(eq(employees.id, id));
      if (avatarFileId) {
        await fileStorage.deleteFiles(db, [avatarFileId]);
      }
      return newFileId;
    },

    findById: async (id) => {
      const [employee] = await orm().select().from(employees).where(eq(employees.id, id));
      return employee ?? null;
    },

    findByUserId: async (userId) => {
      const [employee] = await orm().select().from(employees).where(eq(employees.userId, userId));
      return employee ?? null;
    },

    findByIds: (ids) =>
      orm()
        .select()
        .from(employees)
        .where(isAnyOf(ids))
        .orderBy(...orderByKeyset(keysetColumns(NAME_ORDER, []))),

    findByEmails: (emails) => orm().select().from(employees).where(anyOf(employees.email, emails)),

    async holdForReference(ids) {
      await orm()
        .select({ id: employees.id })
        .from(employees)
        .where(anyOf(employees.id, ids))
        .orderBy(employees.id)
        .for("key share");
    },
    lockByEmails: (emails) =>
      orm()
        .select()
        .from(employees)
        .where(anyOf(employees.email, emails))
        .orderBy(employees.id)
        .for("update"),

    findIdsByAvatar: async (fileId) => {
      const rows = await orm()
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.avatarFileId, fileId));
      return rows.map(({ id }) => id);
    },

    findPage: async ({ order, after, limit, search, scope, employeeIds, suspendedIds }) => {
      const columns = keysetColumns(order, suspendedIds);
      const keys = Object.fromEntries(
        columns.map(({ expression }, index) => [`key${index}`, expression]),
      );
      const rows = await orm()
        .select({ employee: employees, ...keys })
        .from(employees)
        .where(
          sql.join(
            [
              inRecordScope(scope, employees.id),
              ...(search ? [matches(search)] : []),
              ...(employeeIds ? [isAnyOf(employeeIds)] : []),
              ...(after ? [afterKeyset(columns, after)] : []),
            ],
            sql` and `,
          ),
        )
        .orderBy(...orderByKeyset(columns))
        .limit(limit);
      return rows.map((row) => ({
        node: row.employee,
        values: columns.map((_, index) => (row as Record<string, unknown>)[`key${index}`]),
      }));
    },

    count: () => orm().$count(employees),
  };
}

/** The fields an employee takes from the directory: names, manager and the owner's user. */
type DirectoryFields = Pick<Employee, "firstName" | "lastName" | "managerId" | "userId">;

/** A new employee as stored, with the columns only the module itself sets. */
type EmployeeRow = NewEmployee & Partial<Pick<Employee, "avatarFileId" | "userId" | "managerId">>;

function keysetColumns(
  { field, direction }: EmployeeOrder,
  suspendedIds: readonly string[],
): KeysetOrder {
  const descending = direction === "DESC";
  const by = (expression: SQL) => ({ expression, descending });
  const id = sql`${employees.id}`;
  const byName = [by(sql`lower(${employees.firstName})`), by(sql`lower(${employees.lastName})`)];
  switch (field) {
    case "NAME":
      return keysetOrder(byName, id, descending);
    case "EMAIL":
      return keysetOrder([by(sql`${employees.email}`)], id, descending);
    case "STATUS":
      // True sorts after false, so the suspended come first in ascending order.
      return keysetOrder(
        [{ expression: isAnyOf(suspendedIds), descending: !descending }, ...byName],
        id,
        descending,
      );
  }
}

/** Whether the employee is among `employeeIds`; parenthesised, since a keyset compares it as a value. */
function isAnyOf(employeeIds: readonly string[]): SQL {
  return sql`(${anyOf(employees.id, employeeIds)})`;
}

function matches(search: string): SQL {
  const pattern = containsPattern(search);
  return or(
    ilike(sql`${employees.firstName} || ' ' || ${employees.lastName}`, pattern),
    ilike(employees.email, pattern),
  )!;
}
