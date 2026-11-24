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
    currentAccess: [
      { appName: "Slack", catalogKey: "slack", foundVia: slack.foundVia, since: slack.since },
    ],
    suspendedWithAccess: false,
  });
});

it("gives no access for a suspended account in an approved app", () => {
  const access = accessOfEmployees([directory, { ...slack, status: "suspended" }]);

  expect(access.get("ana")).toEqual({
    status: "suspended",
    currentAccess: [],
    suspendedWithAccess: false,
  });
});

it("gives no access for discovered or ignored apps", () => {
  const access = accessOfEmployees([
    directory,
    { ...slack, appStatus: "discovered" },
    { ...slack, appId: "notion", appName: "Notion", catalogKey: "notion", appStatus: "ignored" },
  ]);

  expect(access.get("ana")).toEqual({
    status: "suspended",
    currentAccess: [],
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
      ["ana", { status: "suspended", currentAccess: [], suspendedWithAccess: false }],
      ["mia", { status: "active", currentAccess: [], suspendedWithAccess: false }],
    ]),
  );
});

it("sorts current access by app name", () => {
  const access = accessOfEmployees([
    directory,
    slack,
    { ...slack, appId: "notion", appName: "Notion", catalogKey: "notion" },
    { ...slack, appId: "figma", appName: "Figma", catalogKey: "figma" },
  ]);

  expect(access.get("ana")?.currentAccess).toEqual([
    { appName: "Figma", catalogKey: "figma", foundVia: slack.foundVia, since: slack.since },
    { appName: "Notion", catalogKey: "notion", foundVia: slack.foundVia, since: slack.since },
    { appName: "Slack", catalogKey: "slack", foundVia: slack.foundVia, since: slack.since },
  ]);
});

it("marks a suspended employee with an active approved account as suspended with access", () => {
  const access = accessOfEmployees([directory, slack]);

  expect(access.get("ana")).toEqual({
    status: "suspended",
    currentAccess: [
      { appName: "Slack", catalogKey: "slack", foundVia: slack.foundVia, since: slack.since },
    ],
    suspendedWithAccess: true,
  });
});

it("does not mark an active employee with approved apps as suspended with access", () => {
  const access = accessOfEmployees([{ ...directory, status: "active" }, slack]);

  expect(access.get("ana")).toEqual({
    status: "active",
    currentAccess: [
      { appName: "Slack", catalogKey: "slack", foundVia: slack.foundVia, since: slack.since },
    ],
    suspendedWithAccess: false,
  });
});

const directory: EmployeeAccount = {
  appId: "directory",
  employeeId: "ana",
  appName: "Google Workspace",
  catalogKey: "google_workspace",
  appStatus: "approved",
  status: "suspended",
  inDirectory: true,
  foundVia: ["google_directory"],
  since: { at: new Date("2021-04-01T00:00:00Z"), before: false },
};

const slack: EmployeeAccount = {
  appId: "slack",
  employeeId: "ana",
  appName: "Slack",
  catalogKey: "slack",
  appStatus: "approved",
  status: "active",
  inDirectory: false,
  foundVia: ["google_sign_in"],
  since: { at: new Date("2026-05-25T12:00:00Z"), before: true },
};
