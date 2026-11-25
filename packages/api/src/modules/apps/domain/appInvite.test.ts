import { expect, it } from "vitest";

import { inviteStateOf } from "./appInvite";

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
  { reason: "the connection has never finished a scan", connection: { scannedAt: null } },
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
    inviteStateOf({
      ...activeEmployee,
      latestInvite: { status: "running", finishedAt: null, sourceKey: null },
    }),
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
  "keeps a %s invite from before the last scan when the connector does not list invitations",
  (status) => {
    expect(
      inviteStateOf({
        ...activeEmployee,
        invitation,
        latestInvite: { status, finishedAt, sourceKey: null },
      }),
    ).toEqual({
      offered: false,
      offersReconnect: false,
      invitedAt: finishedAt,
    });
  },
);

it("offers Invite again when the member created by an invite is no longer listed", () => {
  const row = inviteStateOf({
    ...activeEmployee,
    latestInvite: { status: "succeeded", finishedAt, sourceKey: "notion-member" },
  });

  expect(row).toMatchObject({ offered: true, invitedAt: null });
});

it("offers Invite again after a failed invite", () => {
  expect(
    inviteStateOf({
      ...activeEmployee,
      latestInvite: { status: "failed", finishedAt, sourceKey: null },
    }),
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
      latestInvite: { status: "failed", finishedAt, sourceKey: null },
    }),
  ).toEqual({ offered: false, offersReconnect: false, invitedAt: null });
});

it("dates Invited by the app's invitation even when the latest invite failed", () => {
  const row = inviteStateOf({
    ...listsInvitations,
    invitation,
    latestInvite: { status: "failed", finishedAt, sourceKey: null },
  });

  expect(row).toMatchObject({ offered: false, invitedAt: invitation.invitedAt });
});

it("shows Invited for a pending invitation even when the connector cannot invite", () => {
  const row = inviteStateOf({
    ...listsInvitations,
    connection: { ...listsInvitations.connection, invites: false },
    invitation,
  });

  expect(row).toEqual({ offered: false, offersReconnect: false, invitedAt: invitation.invitedAt });
});

it("dates Invited by the first scan that saw an undated invitation", () => {
  const row = inviteStateOf({
    ...listsInvitations,
    invitation: { ...invitation, invitedAt: null },
  });

  expect(row).toMatchObject({ offered: false, invitedAt: invitation.firstSeenAt });
});

it("shows an invitation sent in the app even when no invite was requested here", () => {
  const row = inviteStateOf({ ...listsInvitations, activeInDirectory: false, invitation });

  expect(row).toMatchObject({ offered: false, invitedAt: invitation.invitedAt });
});

it.for(["succeeded", "done_by_hand"] as const)(
  "dates a %s invite by its finish until the next scan",
  (status) => {
    const afterScan = new Date("2026-11-25T10:00:00Z");
    const row = inviteStateOf({
      ...listsInvitations,
      latestInvite: { status, finishedAt: afterScan, sourceKey: null },
    });

    expect(row).toMatchObject({ offered: false, invitedAt: afterScan });
  },
);

it.for(["succeeded", "done_by_hand"] as const)(
  "offers Invite again when a scan after a %s invite finds no invitation",
  (status) => {
    const row = inviteStateOf({
      ...listsInvitations,
      latestInvite: { status, finishedAt, sourceKey: null },
    });

    expect(row).toMatchObject({ offered: true, invitedAt: null });
  },
);

const finishedAt = new Date("2026-11-23T10:00:00Z");
const activeEmployee = {
  activeInDirectory: true,
  connection: {
    status: "connected",
    invites: true,
    listsInvitations: false,
    scannedAt: new Date("2026-11-24T10:00:00Z"),
  },
  hasMember: false,
  invitation: null,
  latestInvite: null,
} as const;
const listsInvitations = {
  ...activeEmployee,
  connection: { ...activeEmployee.connection, listsInvitations: true },
};
const invitation = {
  invitedAt: new Date("2026-11-22T10:00:00Z"),
  firstSeenAt: activeEmployee.connection.scannedAt,
};
