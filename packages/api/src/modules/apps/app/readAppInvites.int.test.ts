import {
  accountLinks,
  appUsers,
  expect,
  failLinearCall,
  inviteTest as test,
  linearInvitations,
  postFakeControl,
  SYSTEM,
} from "#test/support";
import { appInvitations } from "../db";

test("offers Ivan an Invite in Linear and no row in Google Workspace", async ({ workspace }) => {
  const { service, owner, input, ivan } = workspace;

  const rows = await service.readAppInvites(owner, [ivan.id]);

  expect(rows).toMatchObject([
    {
      ...input,
      offered: true,
      offersReconnect: false,
      invitedAt: null,
      latestInvite: null,
    },
  ]);
});

test("refuses an Invite once the owner links Ivan to a scanned Linear member under another email", async ({
  orm,
  seed,
  workspace: { service, owner, input, ivan, linear },
}) => {
  await seed.appAccount({
    appId: linear.appId,
    employeeId: ivan.id,
    email: ivan.email,
    foundVia: ["google_sign_in"],
  });
  expect(await service.readAppInvites(owner, [ivan.id])).toMatchObject([
    { ...input, offered: true },
  ]);

  await accountLinks(orm).linkAccount(owner, {
    appAccountId: linear.account("deploys@acme.example").id,
    employeeId: ivan.id,
  });

  expect.soft(await service.readAppInvites(owner, [ivan.id])).toEqual([]);
  await expect(service.inviteEmployee(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });
});

test("keeps Ivan Invited until a scan finds his Linear member, then shows his account", async ({
  workspace,
  fakeConnectors,
  orm,
}) => {
  const { service, owner, input, ivan, linear } = workspace;
  const { latestInvite } = await service.inviteEmployee(owner, input);
  await service.runChange(SYSTEM, latestInvite!.id);

  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  expect(await service.readAppInvites(owner, [ivan.id])).toMatchObject([
    {
      ...input,
      offered: false,
      invitedAt: expect.any(Date) as unknown,
      latestInvite: { id: latestInvite!.id, status: "succeeded" },
    },
  ]);

  await postFakeControl(fakeConnectors.url, `linear/invitations/${ivan.email}/accept`);
  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await service.readAppInvites(owner, [ivan.id])).toEqual([]);
  const accounts = await appUsers(orm).readUsersOfEmployees(owner, [ivan.id]);
  expect(accounts.find(({ appId }) => appId === linear.appId)).toMatchObject({
    ...input,
    email: ivan.email,
    inApp: true,
  });
});

test("offers Try again with the failure's reason until done by hand dates Invited by that failure's finish", async ({
  workspace,
  fakeConnectors,
}) => {
  const { service, owner, input, ivan } = workspace;
  const { latestInvite } = await service.inviteEmployee(owner, input);
  await failLinearCall(fakeConnectors.url, "actions/run", "unexpected_response");
  await service.runChange(SYSTEM, latestInvite!.id);

  const failed = await service.readAppInvites(owner, [ivan.id]);
  expect(failed).toMatchObject([
    {
      ...input,
      offered: true,
      invitedAt: null,
      latestInvite: {
        id: latestInvite!.id,
        status: "failed",
        error: "unexpected_response",
        finishedAt: expect.any(Date) as unknown,
      },
    },
  ]);
  await service.markChangeDoneByHand(owner, latestInvite!.id);

  expect(await service.readAppInvites(owner, [ivan.id])).toMatchObject([
    {
      ...input,
      offered: false,
      invitedAt: failed[0]!.latestInvite!.finishedAt,
      latestInvite: { id: latestInvite!.id, status: "done_by_hand" },
    },
  ]);
});

test("shows an invitation sent in Linear with Linear's date and no invite of ours", async ({
  workspace: { service, owner, linear, ivan },
  fakeConnectors,
}) => {
  await postFakeControl(fakeConnectors.url, "linear/invitations", { email: ivan.email });
  const [invitation] = await linearInvitations(fakeConnectors.url, ivan.email);
  const invitedAt = new Date(invitation!.invitedAt!);

  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await service.readAppInvites(owner, [ivan.id])).toMatchObject([
    { employeeId: ivan.id, appId: linear.appId, offered: false, invitedAt, latestInvite: null },
  ]);
});

test("offers Invite again after our invite succeeded and a scan finds it expired", async ({
  workspace: { service, owner, linear, ivan, input },
  fakeConnectors,
}) => {
  const { latestInvite } = await service.inviteEmployee(owner, input);
  await service.runChange(SYSTEM, latestInvite!.id);
  await postFakeControl(fakeConnectors.url, `linear/invitations/${ivan.email}/expire`);

  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await service.readAppInvites(owner, [ivan.id])).toMatchObject([
    {
      ...input,
      offered: true,
      invitedAt: null,
      latestInvite: { id: latestInvite!.id, status: "succeeded" },
    },
  ]);
});

test("dates a successful invite by its finish until the next scan reads Linear's date", async ({
  workspace: { service, owner, linear, ivan, input },
  fakeConnectors,
}) => {
  const { latestInvite } = await service.inviteEmployee(owner, input);
  await service.runChange(SYSTEM, latestInvite!.id);

  const [before] = await service.readAppInvites(owner, [ivan.id]);
  expect(before?.latestInvite).toMatchObject({
    status: "succeeded",
    finishedAt: expect.any(Date) as unknown,
  });
  expect(before!.invitedAt).toEqual(before!.latestInvite!.finishedAt);

  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);

  const [invitation] = await linearInvitations(fakeConnectors.url, ivan.email);
  expect(await service.readAppInvites(owner, [ivan.id])).toMatchObject([
    { ...input, offered: false, invitedAt: new Date(invitation!.invitedAt!) },
  ]);
});

test("the database refuses a second invitation for the same connection and email", async ({
  orm,
  seed,
}) => {
  const app = await seed.app({ name: "Linear", domain: "linear.app", catalogKey: "linear" });
  const connection = await seed.appConnection({ appId: app.id, connector: "linear" });
  const invitation = {
    appId: app.id,
    connectionId: connection.id,
    email: "ivan@acme.example",
    firstSeenAt: new Date("2026-11-24T10:00:00Z"),
    invitedAt: null,
    expiresAt: null,
  };
  await orm.insert(appInvitations).values(invitation);

  await expect(orm.insert(appInvitations).values(invitation)).rejects.toMatchObject({
    cause: { code: "23505" },
  });
});
