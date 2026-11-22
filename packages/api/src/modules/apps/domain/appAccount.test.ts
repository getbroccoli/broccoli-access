import { expect, it } from "vitest";

import {
  accountChanges,
  countSuspendedWithAccess,
  planAccountSync,
  type AppAccount,
} from "./appAccount";

it("counts only active accounts belonging to employees suspended in the directory", () => {
  const users: Pick<AppAccount, "employeeId" | "status">[] = [
    { employeeId: "employee-ana", status: "active" },
    { employeeId: "employee-ben", status: "active" },
    { employeeId: "employee-chloe", status: "suspended" },
    { employeeId: null, status: "active" },
    { employeeId: "employee-david", status: "active" },
  ];
  const suspendedInDirectory = new Set(["employee-ana", "employee-ben", "employee-chloe"]);

  const count = countSuspendedWithAccess(users, suspendedInDirectory);

  expect(count).toBe(2);
});

it("plans no update for a found account whose fields did not change", () => {
  const plan = planAccountSync([ACCOUNT], {
    findingKind: "google_directory",
    found: [ACCOUNT],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [], deleted: [] });
  expect(accountChanges(ACCOUNT, { ...ACCOUNT })).toEqual([]);
});

it("deletes an account when its only finding kind no longer sees it", () => {
  const plan = planAccountSync([ACCOUNT], {
    findingKind: "google_directory",
    found: [],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [], deleted: [ACCOUNT] });
  expect(accountChanges(ACCOUNT, null)).toEqual([
    { field: "email", oldValue: "ana@acme.example", newValue: null },
    { field: "employee", oldValue: "employee-ana", newValue: null },
    { field: "status", oldValue: "active", newValue: null },
    { field: "foundVia", oldValue: "google_directory", newValue: null },
  ]);
});

it("keeps an account another finding kind sees and removes only the missing kind", () => {
  const before = { ...ACCOUNT, foundVia: ["google_directory", "google_sign_in"] };
  const after = { ...ACCOUNT, foundVia: ["google_sign_in"] };

  const plan = planAccountSync([before], {
    findingKind: "google_directory",
    found: [],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [{ before, after }], deleted: [] });
  expect(accountChanges(before, after)).toEqual([
    { field: "foundVia", oldValue: "google_directory, google_sign_in", newValue: "google_sign_in" },
  ]);
});

it("adds a second finding kind to a known account", () => {
  const after = { ...ACCOUNT, foundVia: ["google_directory", "google_sign_in"] };

  const plan = planAccountSync([ACCOUNT], {
    findingKind: "google_sign_in",
    found: [ACCOUNT],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [{ before: ACCOUNT, after }], deleted: [] });
  expect(accountChanges(ACCOUNT, after)).toEqual([
    {
      field: "foundVia",
      oldValue: "google_directory",
      newValue: "google_directory, google_sign_in",
    },
  ]);
});

it("keeps the status read by the app's connection while adding a finding kind", () => {
  const before = { ...ACCOUNT, status: "suspended" as const, foundVia: ["linear_members"] };

  const plan = planAccountSync([before], {
    findingKind: "google_sign_in",
    found: [ACCOUNT],
    now: NOW,
    statusKeptIn: new Set([before.appId]),
    statusKeptFor: new Set(),
  });

  expect(plan.updated).toEqual([
    { before, after: { ...before, foundVia: ["linear_members", "google_sign_in"] } },
  ]);
});

it("keeps the status of a protected account while updating its employee", () => {
  const before = { ...ACCOUNT, employeeId: null, status: "suspended" as const };

  const plan = planAccountSync([before], {
    findingKind: "google_directory",
    found: [ACCOUNT],
    now: NOW,
    statusKeptIn: new Set(),
    statusKeptFor: new Set([before.id]),
  });

  expect(plan.updated).toEqual([{ before, after: { ...before, employeeId: ACCOUNT.employeeId } }]);
});

it("takes the found status for a new account in an app another connection reads", () => {
  const plan = planAccountSync([], {
    findingKind: "google_sign_in",
    found: [
      {
        appId: ACCOUNT.appId,
        email: ACCOUNT.email,
        employeeId: ACCOUNT.employeeId,
        status: "suspended",
        grantedAt: null,
        grantedBefore: null,
      },
    ],
    now: NOW,
    statusKeptIn: new Set([ACCOUNT.appId]),
    statusKeptFor: new Set(),
  });

  expect(plan.created).toMatchObject([
    { email: ACCOUNT.email, status: "suspended", foundVia: ["google_sign_in"] },
  ]);
});

it.each([
  { grantedAt: new Date("2026-08-12T10:00:00Z"), grantedBefore: null },
  { grantedAt: null, grantedBefore: new Date("2026-05-25T08:00:00Z") },
])("takes the found grant dates when creating an account (%j)", (dates) => {
  const found = {
    appId: ACCOUNT.appId,
    email: ACCOUNT.email,
    employeeId: ACCOUNT.employeeId,
    status: ACCOUNT.status,
    ...dates,
  };

  const plan = planAccountSync([], {
    findingKind: "google_sign_in",
    found: [found],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({
    created: [{ ...found, foundVia: ["google_sign_in"], firstSeenAt: NOW }],
    updated: [],
    deleted: [],
  });
});

it.each([null, new Date("2026-05-24T08:00:00Z"), new Date("2026-05-26T08:00:00Z")])(
  "keeps granted_before from the scan that first saw the account (%s)",
  (grantedBefore) => {
    const before = { ...ACCOUNT, grantedBefore: new Date("2026-05-25T08:00:00Z") };
    const found = { ...before, status: "suspended" as const, grantedBefore };

    const plan = planAccountSync([before], {
      findingKind: "google_directory",
      found: [found],
      statusKeptIn: new Set(),
      statusKeptFor: new Set(),
      now: NOW,
    });

    expect(plan.updated).toEqual([{ before, after: { ...before, status: "suspended" } }]);
  },
);

it("does not add a grant date to an account first seen undated", () => {
  const before = { ...ACCOUNT, grantedBefore: new Date("2026-05-25T08:00:00Z") };
  const found = { ...before, grantedAt: new Date("2026-08-12T10:00:00Z"), grantedBefore: null };

  const plan = planAccountSync([before], {
    findingKind: "google_directory",
    found: [found],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [], deleted: [] });
});

it("moves a known grant date earlier when the scan finds an older event", () => {
  const before = { ...ACCOUNT, grantedAt: new Date("2026-08-12T10:00:00Z") };
  const after = { ...before, grantedAt: new Date("2026-08-01T10:00:00Z") };

  const plan = planAccountSync([before], {
    findingKind: "google_directory",
    found: [after],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [{ before, after }], deleted: [] });
});

it("does not move a known grant date later", () => {
  const before = { ...ACCOUNT, grantedAt: new Date("2026-08-01T10:00:00Z") };
  const found = { ...before, grantedAt: new Date("2026-08-12T10:00:00Z") };

  const plan = planAccountSync([before], {
    findingKind: "google_directory",
    found: [found],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [], deleted: [] });
});

it("keeps a known grant date when its event falls out of the log", () => {
  const before = { ...ACCOUNT, grantedAt: new Date("2026-08-01T10:00:00Z") };
  const found = { ...before, grantedAt: null, grantedBefore: new Date("2026-08-02T10:00:00Z") };

  const plan = planAccountSync([before], {
    findingKind: "google_directory",
    found: [found],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [], deleted: [] });
});

it("lists changed grant dates as ISO strings after the finding kinds", () => {
  const before = { ...ACCOUNT, grantedAt: new Date("2026-08-12T10:00:00Z") };
  const after = {
    ...before,
    foundVia: ["google_sign_in"],
    grantedAt: null,
    grantedBefore: new Date("2026-05-25T08:00:00Z"),
  };

  expect(accountChanges(before, after)).toEqual([
    { field: "foundVia", oldValue: "google_directory", newValue: "google_sign_in" },
    { field: "grantedAt", oldValue: "2026-08-12T10:00:00.000Z", newValue: null },
    { field: "grantedBefore", oldValue: null, newValue: "2026-05-25T08:00:00.000Z" },
  ]);
});

it("merges two found grants for the same person and app into one active account", () => {
  const account = { appId: ACCOUNT.appId, email: ACCOUNT.email, employeeId: ACCOUNT.employeeId };
  const grantedBefore = new Date("2026-05-25T08:00:00Z");

  const plan = planAccountSync([], {
    findingKind: "google_sign_in",
    found: [
      {
        ...account,
        status: "suspended",
        grantedAt: new Date("2026-08-12T10:00:00Z"),
        grantedBefore: null,
      },
      { ...account, status: "active", grantedAt: null, grantedBefore },
    ],
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
    now: NOW,
  });

  expect(plan).toEqual({
    created: [
      {
        ...account,
        status: "active",
        grantedAt: null,
        grantedBefore,
        foundVia: ["google_sign_in"],
        firstSeenAt: NOW,
      },
    ],
    updated: [],
    deleted: [],
  });
});

const NOW = new Date("2026-11-22T12:00:00Z");
const ACCOUNT: AppAccount = {
  id: "account-ana",
  appId: "app-google-workspace",
  email: "ana@acme.example",
  employeeId: "employee-ana",
  status: "active",
  foundVia: ["google_directory"],
  firstSeenAt: new Date("2026-11-21T12:00:00Z"),
  grantedAt: null,
  grantedBefore: null,
};
