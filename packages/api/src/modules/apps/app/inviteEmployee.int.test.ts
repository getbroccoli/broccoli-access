import {
  expect,
  inviteTest as test,
  linearInvitations,
  postFakeControl,
  SYSTEM,
} from "#test/support";
import { accountChanges } from "../db";

test("stores Ivan's running invite with his email and no account or source key, and queues it by connection", async ({
  orm,
  workspace,
}) => {
  const { service, owner, input, linear, sent } = workspace;

  const row = await service.inviteEmployee(owner, input);

  const change = {
    id: row.latestInvite!.id,
    appId: linear.appId,
    connectionId: linear.connectionId,
    requestedBy: owner.user!.userId,
    action: "invite",
    status: "running",
    appAccountId: null,
    sourceKey: null,
    email: "ivan@acme.example",
  };
  expect(row).toMatchObject({
    ...input,
    offered: false,
    invitedAt: null,
    latestInvite: { ...change, changesAhead: 0 },
  });
  expect(await orm.select().from(accountChanges)).toMatchObject([change]);
  expect(sent).toEqual([
    {
      name: "apps.runAccountChange",
      payload: { changeId: change.id },
      options: { group: linear.connectionId },
    },
  ]);
});

test("running Ivan's invite sends one Linear invitation and shows him Invited, dated by its finish", async ({
  workspace,
  fakeConnectors,
}) => {
  const { service, owner, input, ivan } = workspace;
  const { latestInvite } = await service.inviteEmployee(owner, input);

  await service.runChange(SYSTEM, latestInvite!.id);

  expect(await linearInvitations(fakeConnectors.url, ivan.email)).toHaveLength(1);
  const rows = await service.readAppInvites(owner, [ivan.id]);
  expect(rows).toMatchObject([
    {
      ...input,
      offered: false,
      latestInvite: {
        id: latestInvite!.id,
        status: "succeeded",
        finishedAt: expect.any(Date) as unknown,
      },
    },
  ]);
  expect(rows[0]!.invitedAt).toEqual(rows[0]!.latestInvite!.finishedAt);
});

test("refuses a second Invite while the first runs and Linear receives one invitation", async ({
  workspace,
  fakeConnectors,
  orm,
}) => {
  const { service, owner, input, ivan, sent } = workspace;
  const first = await service.inviteEmployee(owner, input);

  await expect(service.inviteEmployee(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });

  expect(await orm.select({ id: accountChanges.id }).from(accountChanges)).toEqual([
    { id: first.latestInvite!.id },
  ]);
  expect(sent).toHaveLength(1);
  await service.runChange(SYSTEM, first.latestInvite!.id);
  expect(await linearInvitations(fakeConnectors.url, ivan.email)).toHaveLength(1);
});

test("succeeds when Linear answers the invite with Ivan's existing member", async ({
  workspace,
  fakeConnectors,
}) => {
  const { service, owner, input, ivan } = workspace;
  const response = await fetch(`${fakeConnectors.url}/_fake/linear/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ivan.email }),
  });
  expect(response.status).toBe(204);
  await postFakeControl(fakeConnectors.url, `linear/invitations/${ivan.email}/accept`);
  const { latestInvite } = await service.inviteEmployee(owner, input);

  await service.runChange(SYSTEM, latestInvite!.id);

  expect(await service.readAppInvites(owner, [ivan.id])).toMatchObject([
    {
      latestInvite: { id: latestInvite!.id, status: "succeeded" },
    },
  ]);
  expect(await linearInvitations(fakeConnectors.url, ivan.email)).toHaveLength(0);
});

test.for([
  { reason: "Ben is suspended in Google", email: "ben@acme.example", google: false },
  { reason: "Chloé already has a Linear member", email: "chloe@acme.example", google: false },
  { reason: "Google Workspace does not invite", email: "ivan@acme.example", google: true },
])(
  "refuses Invite when $reason without storing or queuing it",
  async ({ email, google }, { workspace, orm }) => {
    const { service, owner, employee, googleApp, linear, sent } = workspace;
    const input = { employeeId: employee(email).id, appId: google ? googleApp.id : linear.appId };

    await expect(service.inviteEmployee(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await orm.select().from(accountChanges)).toEqual([]);
    expect(sent).toEqual([]);
  },
);

test("refuses another Invite once Ivan is Invited without storing or queuing a new change", async ({
  workspace,
  orm,
}) => {
  const { service, owner, input, sent } = workspace;
  const { latestInvite } = await service.inviteEmployee(owner, input);
  await service.runChange(SYSTEM, latestInvite!.id);
  expect(await service.readAppInvites(owner, [input.employeeId])).toMatchObject([
    { latestInvite: { status: "succeeded" } },
  ]);

  await expect(service.inviteEmployee(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });

  expect(await orm.select({ id: accountChanges.id }).from(accountChanges)).toEqual([
    { id: latestInvite!.id },
  ]);
  expect(sent).toHaveLength(1);
});

test("refuses Invite while Linear needs reconnecting without storing or queuing it", async ({
  workspace,
  orm,
  seed,
}) => {
  const { service, owner, input, linear, sent } = workspace;
  await seed.connectionNeedsReconnect(linear.connectionId);

  await expect(service.inviteEmployee(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });

  expect(await orm.select().from(accountChanges)).toEqual([]);
  expect(sent).toEqual([]);
});

test.for(["employeeId", "appId"] as const)(
  "refuses an unknown %s with NOT_FOUND",
  async (field, { workspace }) => {
    const { service, owner, input } = workspace;
    await expect(
      service.inviteEmployee(owner, {
        ...input,
        [field]: "00000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  },
);

test("the database refuses a second running invite of one email through one connection", async ({
  seed,
}) => {
  const app = await seed.app({ catalogKey: "linear", name: "Linear", domain: "linear.app" });
  const connection = await seed.appConnection({ appId: app.id, connector: "linear" });
  const requester = await seed.user({ email: "owner@example.com" });
  const invite = {
    appId: app.id,
    connectionId: connection.id,
    requestedBy: requester.id,
    requestedAt: new Date("2026-11-23"),
    email: "ivan@acme.example",
    action: "invite",
    status: "running",
    sourceKey: null,
    appAccountId: null,
  } as const;
  await seed.accountChange(invite);

  await expect(seed.accountChange(invite)).rejects.toMatchObject({ cause: { code: "23505" } });
});
