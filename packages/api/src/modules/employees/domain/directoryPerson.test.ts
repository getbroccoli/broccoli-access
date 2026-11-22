import { expect, it } from "vitest";

import { directoryChanges, employeeFromDirectory, type DirectoryPerson } from "./directoryPerson";
import type { Employee } from "./employee";

it("clears the manager when the directory names nobody in the workspace", () => {
  const before = { ...EMPLOYEE, managerId: "employee-david" };
  const person = { ...PERSON, managerEmail: "missing@acme.example" };

  const employee = employeeFromDirectory(before, person, { idsByEmail: new Map(), owner: null });

  expect(employee.managerId).toBeNull();
});

it("gives no manager to a person who names themselves", () => {
  const person = { ...PERSON, managerEmail: EMPLOYEE.email };
  const idsByEmail = new Map([[EMPLOYEE.email, EMPLOYEE.id]]);

  const employee = employeeFromDirectory(EMPLOYEE, person, { idsByEmail, owner: null });

  expect(employee.managerId).toBeNull();
});

it("links the owner's user to the employee with the owner's email", () => {
  const owner = { userId: "user-owner", email: EMPLOYEE.email };

  const employee = employeeFromDirectory(EMPLOYEE, PERSON, { idsByEmail: new Map(), owner });

  expect(employee.userId).toBe(owner.userId);
});

it("does not link the owner's user to another employee", () => {
  const owner = { userId: "user-owner", email: "admin@acme.example" };

  const employee = employeeFromDirectory(EMPLOYEE, PERSON, { idsByEmail: new Map(), owner });

  expect(employee.userId).toBeNull();
});

it("preserves an existing user link even when the employee has the owner's email", () => {
  const before = { ...EMPLOYEE, userId: "user-existing" };
  const owner = { userId: "user-owner", email: EMPLOYEE.email };

  const employee = employeeFromDirectory(before, PERSON, { idsByEmail: new Map(), owner });

  expect(employee.userId).toBe("user-existing");
});

it("records a manager change with the old and new managers' names as labels", () => {
  const before = { ...EMPLOYEE, managerId: "employee-david" };
  const after = { ...EMPLOYEE, managerId: "employee-elif" };
  const namesById = new Map([
    ["employee-david", "David Okafor"],
    ["employee-elif", "Elif Demir"],
  ]);

  const changes = directoryChanges(before, after, namesById);

  expect(changes).toEqual([
    {
      field: "manager",
      oldValue: "employee-david",
      newValue: "employee-elif",
      oldLabel: "David Okafor",
      newLabel: "Elif Demir",
    },
  ]);
});

const EMPLOYEE: Employee = {
  id: "employee-ana",
  firstName: "Ana",
  lastName: "Ruiz",
  email: "ana@acme.example",
  avatarFileId: null,
  createdAt: new Date("2026-11-21T12:00:00Z"),
  userId: null,
  managerId: null,
};
const PERSON: DirectoryPerson = {
  email: "ana@acme.example",
  firstName: "Ana",
  lastName: "Ruiz",
  managerEmail: null,
};
