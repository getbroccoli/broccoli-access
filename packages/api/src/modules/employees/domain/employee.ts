import { z } from "zod";

import { invalidInput } from "../../../core/applicationError";
import type { ListOrder } from "../../../core/pagination";
import { changeReasonSchema, type FieldChange } from "../../../core/records";
import { fieldErrorsOf } from "../helpers";

const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;

/** Someone who works for the company. */
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  /** Work email, lowercased; unique. */
  email: string;
  /** The file holding their avatar, or null. */
  avatarFileId: string | null;
  createdAt: Date;
  /** The user who signs in as this employee, or null. */
  userId: string | null;
}

/** What a list of employees can be sorted by. */
export type EmployeeOrderField = "NAME" | "EMAIL";

/** How a list of employees is sorted. */
export type EmployeeOrder = ListOrder<EmployeeOrderField>;

export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
}

export type NewEmployee = Omit<Employee, "id" | "avatarFileId" | "createdAt" | "userId">;

/** The fields an update sends; an absent field stays as it is, and null clears a nullable one. */
export interface EmployeeUpdateInput {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  /** Why the change is made, kept on its history line. */
  changeReason?: string | null;
}

/** A validated update: the fields to change, normalised, and the reason for its history line. */
export interface EmployeeUpdate {
  changes: Partial<NewEmployee>;
  reason: string | null;
}

/** Work emails are unique: another employee already has this one. */
export class EmailTakenError extends Error {
  constructor() {
    super("Another employee already has this email");
    this.name = "EmailTakenError";
  }
}

const name = z.string().trim().min(1).max(NAME_MAX_LENGTH);

const newEmployeeSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email()),
});

// An absent field stays absent: `partial` skips its normalisation, so it does not become null.
const employeeUpdateSchema = newEmployeeSchema.partial().extend({
  changeReason: changeReasonSchema,
});

/** Validates and normalises a new employee; throws `INVALID_INPUT` naming each bad field. */
export function parseNewEmployee(input: NewEmployeeInput): NewEmployee {
  const result = newEmployeeSchema.safeParse(input);
  if (!result.success) {
    throw invalidInput(fieldErrorsOf(result.error));
  }
  return result.data;
}

/** Validates and normalises the fields an update sends; throws `INVALID_INPUT` naming each bad field. */
export function parseEmployeeUpdate(input: EmployeeUpdateInput): EmployeeUpdate {
  const result = employeeUpdateSchema.safeParse(input);
  if (!result.success) {
    // A required field sent as null is a cleared one, refused like a blank one.
    const cleared = (field: string) => input[field as keyof EmployeeUpdateInput] === null;
    throw invalidInput(
      fieldErrorsOf(result.error).map((error) =>
        cleared(error.field) ? { ...error, code: "required" } : error,
      ),
    );
  }
  const { changeReason: reason, ...changes } = result.data;
  return { changes, reason };
}

/**
 * How a change turned `before` into `after`, field by field, as history keeps it: a new employee
 * has no `before`, a deleted one no `after`. Fields that did not change, or that neither side
 * holds, are left out.
 */
export function employeeChanges(
  before: Partial<NewEmployee> | null,
  after: Partial<NewEmployee> | null,
): FieldChange[] {
  return HISTORY_FIELDS.flatMap((field) => {
    const oldValue = before?.[field] ?? null;
    const newValue = after?.[field] ?? null;
    return oldValue === newValue ? [] : [{ field, oldValue, newValue }];
  });
}

/** The fields whose changes history keeps, in the order a history line lists them. */
const HISTORY_FIELDS = ["firstName", "lastName", "email"] as const;
