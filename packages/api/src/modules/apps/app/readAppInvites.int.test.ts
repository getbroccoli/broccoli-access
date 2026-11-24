import {
  appUsers,
  expect,
  failLinearCall,
  inviteTest as test,
  postFakeControl,
  SYSTEM,
} from "#test/support";

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
