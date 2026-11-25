import { expect, it } from "vitest";

import { offboardingPlanOf } from "../domain";

it("puts the directory first and keeps the other Disable actions in app-name order", () => {
  const accounts = [
    account("calendar"),
    { ...account("directory"), isDirectory: true },
    account("mail"),
  ];

  expect(offboardingPlanOf({ accounts, invitedAppIds: [], invitingAppIds: [] })).toEqual({
    accountIdsToDisable: ["directory-account", "calendar-account", "mail-account"],
    byHandWork: [],
  });
});

it("explains which active accounts and invitations need work by hand", () => {
  const active = { ...account("design"), offeredChange: null };
  const accounts = [
    active,
    { ...active, id: "mail-account", appId: "mail", offersReconnect: true },
    { ...active, id: "notes-account", appId: "notes", isConnectionUser: true },
  ];

  const plan = offboardingPlanOf({ accounts, invitedAppIds: ["calendar"], invitingAppIds: [] });

  expect(plan.accountIdsToDisable).toEqual([]);
  expect(plan.byHandWork).toEqual([
    { appId: "design", reason: "app_has_no_connection" },
    { appId: "mail", reason: "connection_needs_reconnect" },
    { appId: "notes", reason: "account_is_connection_user" },
    { appId: "calendar", reason: "invitation_is_pending" },
  ]);
});

it("puts a suspended account with a running Enable in by-hand work", () => {
  const accounts = [
    {
      ...account("linear"),
      status: "suspended" as const,
      runningChange: "reactivate" as const,
      offeredChange: null,
    },
    { ...account("notion"), offeredChange: null },
  ];

  expect(offboardingPlanOf({ accounts, invitedAppIds: [], invitingAppIds: [] })).toEqual({
    accountIdsToDisable: [],
    byHandWork: [
      { appId: "linear", reason: "change_is_running" },
      { appId: "notion", reason: "app_has_no_connection" },
    ],
  });
});

it("lists running invites after accounts and pending invitations", () => {
  const plan = offboardingPlanOf({
    accounts: [{ ...account("notion"), offeredChange: null }],
    invitedAppIds: ["slack"],
    invitingAppIds: ["figma", "linear"],
  });

  expect(plan).toEqual({
    accountIdsToDisable: [],
    byHandWork: [
      { appId: "notion", reason: "app_has_no_connection" },
      { appId: "slack", reason: "invitation_is_pending" },
      { appId: "figma", reason: "change_is_running" },
      { appId: "linear", reason: "change_is_running" },
    ],
  });
});

it.each([
  { status: "suspended", runningChange: null, offeredChange: "reactivate" },
  { status: "active", runningChange: "suspend", offeredChange: null },
  { status: "suspended", runningChange: "remove", offeredChange: null },
] as const)(
  "leaves a $status account with runningChange=$runningChange out of both lists",
  (facts) => {
    const accounts = [{ ...account("linear"), ...facts }];

    expect(offboardingPlanOf({ accounts, invitedAppIds: [], invitingAppIds: [] })).toEqual({
      accountIdsToDisable: [],
      byHandWork: [],
    });
  },
);

function account(appId: string) {
  return {
    id: `${appId}-account`,
    appId,
    status: "active",
    isDirectory: false,
    offeredChange: "suspend",
    offersRemove: false,
    offersReconnect: false,
    isConnectionUser: false,
    runningChange: null,
  } as const;
}
