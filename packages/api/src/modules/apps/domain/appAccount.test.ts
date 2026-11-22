import { expect, it } from "vitest";

import { accountChanges, planAccountSync, type AppAccount } from "./appAccount";

it("plans no update for a found account whose fields did not change", () => {
  const plan = planAccountSync([ACCOUNT], {
    findingKind: "google_directory",
    found: [ACCOUNT],
    now: NOW,
  });

  expect(plan).toEqual({ created: [], updated: [], deleted: [] });
  expect(accountChanges(ACCOUNT, { ...ACCOUNT })).toEqual([]);
});

it("deletes an account when its only finding kind no longer sees it", () => {
  const plan = planAccountSync([ACCOUNT], {
    findingKind: "google_directory",
    found: [],
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

const NOW = new Date("2026-11-22T12:00:00Z");
const ACCOUNT: AppAccount = {
  id: "account-ana",
  appId: "app-google-workspace",
  email: "ana@acme.example",
  employeeId: "employee-ana",
  status: "active",
  foundVia: ["google_directory"],
  firstSeenAt: new Date("2026-11-21T12:00:00Z"),
};
