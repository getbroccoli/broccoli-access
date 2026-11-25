import { expect, it } from "vitest";

import { failedChangeRow } from "./failedChangeRow";

const APP = { id: "linear" };
const ACCOUNT = {
  id: "account-1",
  email: "ana@acme.example",
  app: APP,
  offeredChange: "SUSPEND" as const,
  offersRemove: false,
  latestChange: { id: "change-1" },
};
const INVITE = { id: "invite-1", app: APP, offered: true, latestInvite: { id: "change-1" } };
const EMPLOYEE = {
  id: "ana",
  appAccounts: [ACCOUNT],
  directoryAccount: null,
  appInvites: [INVITE],
};
const DISABLE = { id: "change-1", action: "SUSPEND" as const, email: ACCOUNT.email, app: APP };

it("finds the account a failed Disable was the latest change of", () => {
  expect(failedChangeRow({ ...DISABLE, employee: EMPLOYEE })).toEqual({
    id: "account-1",
    offeredChange: "SUSPEND",
    offersRemove: false,
  });
});

it("finds the invite row a failed Invite was the latest invite of", () => {
  const invite = { ...DISABLE, action: "INVITE" as const };

  expect(failedChangeRow({ ...invite, employee: EMPLOYEE })).toEqual({
    id: "invite-1",
    offeredChange: "INVITE",
  });
});

it("finds no row once a later change replaced the failed one", () => {
  const later = { ...ACCOUNT, latestChange: { id: "change-2" } };

  expect(failedChangeRow({ ...DISABLE, employee: { ...EMPLOYEE, appAccounts: [later] } })).toBe(
    undefined,
  );
});

it("finds no row for a change without a person", () => {
  expect(failedChangeRow({ ...DISABLE, employee: null })).toBe(undefined);
});
