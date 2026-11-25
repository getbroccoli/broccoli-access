import { expect, it } from "vitest";

import { failedChangeRow } from "./failedChangeRow";

const APP = { id: "linear", roles: [{ key: "member" }] };
const ACCOUNT = {
  id: "account-1",
  status: "ACTIVE" as const,
  offeredChange: "SUSPEND" as const,
  offersRemove: false,
  latestChange: { id: "change-1" },
  app: { id: APP.id, containerConnection: null },
};
const INVITE = {
  id: "invite-1",
  app: { id: APP.id },
  offered: true,
  invitedAt: null,
  latestInvite: { id: "change-1" },
};
const PERSON_APP = { role: null, roleConflict: false, app: APP };
const EMPLOYEE = {
  id: "ana",
  appInvites: [INVITE],
  personApps: { edges: [{ node: PERSON_APP }] },
};
const DISABLE = {
  id: "change-1",
  action: "SUSPEND" as const,
  status: "FAILED" as const,
  app: { id: APP.id },
  appUser: ACCOUNT,
  employee: null,
};
const INVITE_CHANGE = { ...DISABLE, action: "INVITE" as const, appUser: null, employee: EMPLOYEE };

it("acts on the account a failed Disable was the latest change of", () => {
  expect(failedChangeRow(DISABLE)).toEqual({
    id: "account-1",
    offeredChange: "SUSPEND",
    offersRemove: false,
  });
});

it("acts on nothing once the owner marked the change done by hand", () => {
  expect(failedChangeRow({ ...DISABLE, status: "DONE_BY_HAND" })).toBe(undefined);
});

it("acts on nothing once a later change replaced the failed one", () => {
  expect(
    failedChangeRow({ ...DISABLE, appUser: { ...ACCOUNT, latestChange: { id: "change-2" } } }),
  ).toBe(undefined);
});

it("acts on nothing once a scan found the account disabled after all", () => {
  expect(failedChangeRow({ ...DISABLE, appUser: { ...ACCOUNT, status: "SUSPENDED" } })).toBe(
    undefined,
  );
});

it("acts on the invite row a failed Invite was the latest invite of", () => {
  expect(failedChangeRow(INVITE_CHANGE)).toEqual({
    id: "invite-1",
    roleConflict: false,
    offeredChange: "INVITE",
  });
});

it("withholds Invite while the person's role in the app needs the owner first", () => {
  const conflict = { ...PERSON_APP, roleConflict: true };
  const employee = { ...EMPLOYEE, personApps: { edges: [{ node: conflict }] } };

  expect(failedChangeRow({ ...INVITE_CHANGE, employee })).toEqual({
    id: "invite-1",
    roleConflict: true,
    offeredChange: null,
  });
});

it("acts on nothing once a scan read the person's pending invitation", () => {
  const invited = { ...INVITE, invitedAt: "2026-11-25T10:00:00.000Z" };

  expect(
    failedChangeRow({ ...INVITE_CHANGE, employee: { ...EMPLOYEE, appInvites: [invited] } }),
  ).toBe(undefined);
});
