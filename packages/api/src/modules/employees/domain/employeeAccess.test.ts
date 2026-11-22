import { expect, it } from "vitest";

import { accessOfEmployees, type EmployeeAccount } from "../domain";

it("takes the employee's status from the directory account", () => {
  const accounts: EmployeeAccount[] = [
    { ...directory, status: "active" },
    { ...slack, status: "suspended" },
  ];

  const access = accessOfEmployees(accounts);

  expect(access.get("ana")?.status).toBe("active");
});

it("has no status without a directory account", () => {
  const access = accessOfEmployees([slack]);

  expect(access.get("ana")).toEqual({
    status: null,
    approvedAppNames: ["Slack"],
    suspendedWithAccess: false,
  });
});

it("gives no access for a suspended account in an approved app", () => {
  const access = accessOfEmployees([directory, { ...slack, status: "suspended" }]);

  expect(access.get("ana")).toEqual({
    status: "suspended",
    approvedAppNames: [],
    suspendedWithAccess: false,
  });
});

it("gives no access for discovered or ignored apps", () => {
  const access = accessOfEmployees([
    directory,
    { ...slack, appStatus: "discovered" },
    { ...slack, appName: "Notion", appStatus: "ignored" },
  ]);

  expect(access.get("ana")).toEqual({
    status: "suspended",
    approvedAppNames: [],
    suspendedWithAccess: false,
  });
});

it("excludes the directory from approved apps and access", () => {
  const access = accessOfEmployees([
    directory,
    { ...directory, employeeId: "mia", status: "active" },
  ]);

  expect(access).toEqual(
    new Map([
      ["ana", { status: "suspended", approvedAppNames: [], suspendedWithAccess: false }],
      ["mia", { status: "active", approvedAppNames: [], suspendedWithAccess: false }],
    ]),
  );
});

it("sorts approved app names by name", () => {
  const access = accessOfEmployees([
    directory,
    slack,
    { ...slack, appName: "Notion" },
    { ...slack, appName: "Figma" },
  ]);

  expect(access.get("ana")?.approvedAppNames).toEqual(["Figma", "Notion", "Slack"]);
});

it("marks a suspended employee with an active approved account as suspended with access", () => {
  const access = accessOfEmployees([directory, slack]);

  expect(access.get("ana")).toEqual({
    status: "suspended",
    approvedAppNames: ["Slack"],
    suspendedWithAccess: true,
  });
});

it("does not mark an active employee with approved apps as suspended with access", () => {
  const access = accessOfEmployees([{ ...directory, status: "active" }, slack]);

  expect(access.get("ana")).toEqual({
    status: "active",
    approvedAppNames: ["Slack"],
    suspendedWithAccess: false,
  });
});

const directory: EmployeeAccount = {
  employeeId: "ana",
  appName: "Google Workspace",
  appStatus: "approved",
  status: "suspended",
  inDirectory: true,
};

const slack: EmployeeAccount = {
  employeeId: "ana",
  appName: "Slack",
  appStatus: "approved",
  status: "active",
  inDirectory: false,
};
