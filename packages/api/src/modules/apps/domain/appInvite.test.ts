import { expect, it } from "vitest";

import { inviteStateOf } from "./appInvite";

const activeEmployee = {
  activeInDirectory: true,
  connection: { status: "connected", invites: true, scanned: true },
  hasMember: false,
  latestInvite: null,
} as const;
const finishedAt = new Date("2026-11-23T10:00:00Z");

it("offers Invite to an active employee whom the connection's last scan did not find", () => {
  expect(inviteStateOf(activeEmployee)).toEqual({
    offered: true,
    offersReconnect: false,
    invitedAt: null,
  });
});

it("shows no row for an employee the connection's last scan found", () => {
  expect(inviteStateOf({ ...activeEmployee, hasMember: true })).toBeNull();
});

it.for([
  { reason: "the connector does not invite", connection: { invites: false } },
  { reason: "the connection has never finished a scan", connection: { scanned: false } },
])("shows no row when $reason", ({ connection }) => {
  expect(
    inviteStateOf({
      ...activeEmployee,
      connection: { ...activeEmployee.connection, ...connection },
    }),
  ).toBeNull();
});

it("shows no row for an employee not active in the directory who was never invited", () => {
  expect(inviteStateOf({ ...activeEmployee, activeInDirectory: false })).toBeNull();
});

it("offers no Invite while an invite runs", () => {
  expect(
    inviteStateOf({ ...activeEmployee, latestInvite: { status: "running", finishedAt: null } }),
  ).toEqual({
    offered: false,
    offersReconnect: false,
    invitedAt: null,
  });
});

it("offers Reconnect while the connection needs reconnecting", () => {
  expect(
    inviteStateOf({
      ...activeEmployee,
      connection: { ...activeEmployee.connection, status: "reconnect" },
    }),
  ).toEqual({
    offered: false,
    offersReconnect: true,
    invitedAt: null,
  });
});

it.for(["succeeded", "done_by_hand"] as const)(
  "shows Invited, dated by the finish, after a %s invite",
  (status) => {
    expect(inviteStateOf({ ...activeEmployee, latestInvite: { status, finishedAt } })).toEqual({
      offered: false,
      offersReconnect: false,
      invitedAt: finishedAt,
    });
  },
);

it("offers Invite again after a failed invite", () => {
  expect(
    inviteStateOf({ ...activeEmployee, latestInvite: { status: "failed", finishedAt } }),
  ).toEqual({
    offered: true,
    offersReconnect: false,
    invitedAt: null,
  });
});

it("keeps the failed invite row without offering Invite to an employee not active in the directory", () => {
  expect(
    inviteStateOf({
      ...activeEmployee,
      activeInDirectory: false,
      latestInvite: { status: "failed", finishedAt },
    }),
  ).toEqual({ offered: false, offersReconnect: false, invitedAt: null });
});
