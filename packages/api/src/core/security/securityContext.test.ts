import { expect, it } from "vitest";

import { ADMIN, EMPLOYEE, OWNER, SETUP_HOLDER, SYSTEM } from "#test/support";

import { requireSignedIn } from ".";

it("refuses a missing security context with UNAUTHENTICATED", () => {
  expect(() => requireSignedIn(null)).toThrowError(
    expect.objectContaining({
      code: "UNAUTHENTICATED",
      message: "Sign in to continue.",
      fieldErrors: [],
    }),
  );
});

it.each([
  ["owner", "MANAGE_WORKSPACE", OWNER],
  ["admin", "MANAGE_WORKSPACE", ADMIN],
  ["system", "MANAGE_WORKSPACE", SYSTEM],
] as const)("allows %s operation %s", (_name, operation, ctx) => {
  expect(ctx.can(operation)).toBe(true);
  expect(() => ctx.require(operation)).not.toThrow();
});

it.each([
  ["employee", "MANAGE_WORKSPACE", EMPLOYEE, "Only admins can do this."],
  ["setup holder", "MANAGE_WORKSPACE", SETUP_HOLDER, "Only admins can do this."],
] as const)("refuses the %s operation %s", (_name, operation, ctx, message) => {
  expect(ctx.can(operation)).toBe(false);
  expect(() => ctx.require(operation)).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message,
      fieldErrors: [],
    }),
  );
});

it("allows Broccoli Access's own work", () => {
  expect(() => SYSTEM.requireSystem()).not.toThrow();
});

it.each([OWNER, ADMIN, EMPLOYEE, SETUP_HOLDER])(
  "refuses system access to any other caller",
  (ctx) => {
    expect(() => ctx.requireSystem()).toThrowError(
      expect.objectContaining({
        code: "FORBIDDEN",
        message: "Only Broccoli Access can do this.",
      }),
    );
  },
);

it.each(["create", "read", "update", "delete"] as const)(
  "allows the system to %s every employee",
  (action) => {
    expect(() => SYSTEM.requireEveryRecord("employee", action)).not.toThrow();
  },
);

it("allows an employee to read every employee", () => {
  expect(() => EMPLOYEE.requireEveryRecord("employee", "read")).not.toThrow();
});

it("combines the operations and grants of EMPLOYEE and ADMIN", () => {
  expect(ADMIN.user?.permissionProfiles).toEqual(["EMPLOYEE", "ADMIN"]);
  expect(ADMIN.can("MANAGE_WORKSPACE")).toBe(true);
  expect(() => ADMIN.requireEveryRecord("employee", "create")).not.toThrow();
});

it("refuses an employee creating employees", () => {
  expect(() => EMPLOYEE.requireEveryRecord("employee", "create")).toThrowError(
    expect.objectContaining({ code: "FORBIDDEN", message: "You are not allowed to do this." }),
  );
});

it("distinguishes the system from a signed-in user", () => {
  expect(SYSTEM.user).toBeNull();
  expect(SYSTEM.isSystem).toBe(true);
  expect(EMPLOYEE.user).toMatchObject({ permissionProfiles: ["EMPLOYEE"], employeeId: null });
  expect(EMPLOYEE.isSystem).toBe(false);
});
