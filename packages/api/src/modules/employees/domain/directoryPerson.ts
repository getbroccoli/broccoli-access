import type { FieldChange } from "../../../core/records";
import { type Employee, employeeChanges } from "./employee";

/** Someone the directory app lists, by the fields employees take from it. */
export interface DirectoryPerson {
  /** Lowercased. */
  email: string;
  firstName: string;
  lastName: string;
  /** Lowercased; null without a manager. */
  managerEmail: string | null;
}

/** Who the directory's employees are linked to: each employee's id by email, and the owner. */
export interface DirectoryLinks {
  idsByEmail: ReadonlyMap<string, string>;
  owner: { userId: string; email: string } | null;
}

/**
 * The employee as the directory has them: its names, the employee its manager email names, and,
 * on the owner's employee not yet linked, the owner's user.
 */
export function employeeFromDirectory(
  employee: Employee,
  person: DirectoryPerson,
  { idsByEmail, owner }: DirectoryLinks,
): Employee {
  const managerId =
    person.managerEmail === null ? null : (idsByEmail.get(person.managerEmail) ?? null);
  const isOwner = owner !== null && owner.email === employee.email;
  return {
    ...employee,
    firstName: person.firstName,
    lastName: person.lastName,
    managerId: managerId === employee.id ? null : managerId,
    userId: employee.userId ?? (isOwner ? owner.userId : null),
  };
}

/**
 * The changes history keeps from `before` to `after`: each manager named as they were then, and
 * the owner's user by the employee's email, which is theirs.
 */
export function directoryChanges(
  before: Employee | null,
  after: Employee,
  managerNames: { before: ReadonlyMap<string, string>; after: ReadonlyMap<string, string> },
): FieldChange[] {
  const changes = employeeChanges(before, after);
  const oldManager = before?.managerId ?? null;
  if (oldManager !== after.managerId) {
    changes.push({
      field: "manager",
      oldValue: oldManager,
      newValue: after.managerId,
      oldLabel: oldManager && (managerNames.before.get(oldManager) ?? null),
      newLabel: after.managerId && (managerNames.after.get(after.managerId) ?? null),
    });
  }
  const oldUser = before?.userId ?? null;
  if (oldUser !== after.userId) {
    changes.push({
      field: "user",
      oldValue: oldUser,
      newValue: after.userId,
      oldLabel: oldUser && before!.email,
      newLabel: after.userId && after.email,
    });
  }
  return changes;
}
