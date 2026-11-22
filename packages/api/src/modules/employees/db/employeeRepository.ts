import { eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  afterKeyset,
  containsPattern,
  isUniqueViolation,
  type KeysetOrder,
  keysetOrder,
  type Orm,
  ormOf,
  orderByKeyset,
  type Tx,
} from "../../../core/db";
import { user } from "../../../core/auth";
import { createFileStorageService } from "../../../core/files";
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

const fileStorage = createFileStorageService();

/** Employees stored in Postgres, through the pool or inside a transaction, which inserts need. */
export interface EmployeeRepository {
  /** Throws `EmailTakenError` when another employee has the email. */
  insert(newEmployee: EmployeeRow): Promise<Employee>;
  /**
   * Changes an employee's fields under the row's lock and returns the employee before and after;
   * null when no employee has the id. Throws `EmailTakenError` like `insert`.
   */
  update(
    id: string,
    changes: Partial<NewEmployee>,
  ): Promise<{ before: Employee; after: Employee } | null>;
  /**
   * Deletes an employee, their avatar and the user who signs in as them, and returns what was
   * deleted; null when no employee has the id.
   */
  delete(id: string): Promise<Employee | null>;
  findById(id: string): Promise<Employee | null>;
  /** The employee linked to this user, or null. */
  findByUserId(userId: string): Promise<Employee | null>;
  /** The employees among these ids that exist. */
  findByIds(ids: readonly string[]): Promise<Employee[]>;
  /** The employees whose avatar is this file. */
  findIdsByAvatar(fileId: string): Promise<string[]>;
  /** Up to `limit` employees after `after`, with their sort values as Postgres computed them. */
  findPage(query: EmployeePageQuery): Promise<KeysetRow<Employee, unknown[]>[]>;
}

const EMAIL_UNIQUE_CONSTRAINT = "employees_email_unique";

// Postgres text cannot hold NUL, so a cursor with one is no cursor this API issued.
const sortText = z.string().refine((value) => !value.includes("\0"));

/** The sort values of an employee in each order, as `findPage` returns them. */
export const EMPLOYEE_SORT_VALUES: Record<EmployeeOrderField, z.ZodType<unknown[]>> = {
  NAME: z.tuple([sortText, sortText, z.uuid()]),
  EMAIL: z.tuple([sortText, z.uuid()]),
};

export interface EmployeePageQuery extends KeysetQuery<EmployeeOrderField, unknown[]> {
  /** Trimmed and non-blank, or null for no filter. */
  search: string | null;
  /** The employees the caller may read; `inRecordScope` refuses "none". */
  scope: RecordScope;
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

    delete: async (id) => {
      const [employee] = await orm().delete(employees).where(eq(employees.id, id)).returning();
      if (employee?.avatarFileId) {
        await fileStorage.deleteFiles(db, [employee.avatarFileId]);
      }
      if (employee?.userId) {
        // Their sessions and password go with the user.
        await orm().delete(user).where(eq(user.id, employee.userId));
      }
      return employee ?? null;
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
        .where(sql`${employees.id} = any(${sql.param([...ids])}::uuid[])`),

    findIdsByAvatar: async (fileId) => {
      const rows = await orm()
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.avatarFileId, fileId));
      return rows.map(({ id }) => id);
    },

    findPage: async ({ order, after, limit, search, scope }) => {
      const columns = keysetColumns(order);
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
  };
}

/** A new employee as stored, with the columns only the module itself sets. */
type EmployeeRow = NewEmployee & Partial<Pick<Employee, "avatarFileId" | "userId" | "managerId">>;

function keysetColumns({ field, direction }: EmployeeOrder): KeysetOrder {
  const descending = direction === "DESC";
  const by = (expression: SQL) => ({ expression, descending });
  const id = sql`${employees.id}`;
  switch (field) {
    case "NAME":
      return keysetOrder(
        [by(sql`lower(${employees.firstName})`), by(sql`lower(${employees.lastName})`)],
        id,
        descending,
      );
    case "EMAIL":
      return keysetOrder([by(sql`${employees.email}`)], id, descending);
  }
}

function matches(search: string): SQL {
  const pattern = containsPattern(search);
  return or(
    ilike(sql`${employees.firstName} || ' ' || ${employees.lastName}`, pattern),
    ilike(employees.email, pattern),
  )!;
}
