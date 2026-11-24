import {
  apps,
  containerConnectors,
  expect,
  failLinearCall,
  inviteTest as test,
  postFakeControl,
  scans,
  serveAccountList,
  SYSTEM,
} from "#test/support";

test("keeps invitations from both pages when a scan reads a second page", async ({
  workspace: { owner, service, linear, ivan, employee },
  orm,
  fakeConnectors,
}) => {
  const ben = employee("ben@acme.example");
  const invitedAt = "2026-11-23T10:00:00.000Z";
  const server = await serveAccountList(fakeConnectors.url, (request, response) => {
    const first = (request.body as { cursor: string | null }).cursor === null;
    response.json({
      accounts: [],
      nextCursor: first ? "second" : null,
      invitations: [{ email: first ? ben.email : ivan.email, invitedAt, expiresAt: null }],
    });
  });
  const scan = scans(orm, { connectors: containerConnectors(server.url) });
  await scan.scanNow(owner, linear.connectionId);

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(await service.readAppInvites(owner, [ben.id, ivan.id])).toMatchObject([
    { employeeId: ben.id, invitedAt: new Date(invitedAt), offered: false },
    { employeeId: ivan.id, invitedAt: new Date(invitedAt), offered: false },
  ]);
});

test.for(["first", "second"] as const)(
  "keeps the last invitations when the %s page of a scan fails",
  async (page, { workspace: { linear, owner, service, ivan }, seed, orm, fakeConnectors }) => {
    const newHire = await seed.employee({ email: "new.hire@acme.example" });
    const before = await service.readAppInvites(owner, [newHire.id, ivan.id]);
    expect(before).toMatchObject([
      { employeeId: newHire.id, invitedAt: expect.any(Date) as unknown, offered: false },
      { employeeId: ivan.id, invitedAt: null, offered: true },
    ]);
    await postFakeControl(fakeConnectors.url, `linear/invitations/${newHire.email}/expire`);
    await failLinearCall(fakeConnectors.url, "accounts/list", "unexpected_response");
    const server = await serveAccountList(fakeConnectors.url, (request, response, next) => {
      if (page === "second" && (request.body as { cursor: string | null }).cursor === null) {
        response.json({
          accounts: [],
          nextCursor: "second",
          invitations: [{ email: ivan.email, invitedAt: null, expiresAt: null }],
        });
      } else {
        next();
      }
    });
    const scan = scans(orm, { connectors: containerConnectors(server.url) });
    await scan.scanNow(owner, linear.connectionId);

    await scan.runScan(SYSTEM, linear.sourceId);

    expect(await scan.readScan(owner, linear.connectionId)).toMatchObject({
      status: "scan_failed",
    });
    expect(await service.readAppInvites(owner, [newHire.id, ivan.id])).toEqual(before);
  },
);

test("offers Invite again when the next scan no longer finds the invitation", async ({
  workspace: { owner, service, linear },
  seed,
  orm,
  fakeConnectors,
}) => {
  const newHire = await seed.employee({ email: "new.hire@acme.example" });
  await seed.appAccount({
    appId: (await apps(orm).directoryAppId(orm))!,
    employeeId: newHire.id,
    email: newHire.email,
    foundVia: ["google_directory"],
  });
  expect(await service.readAppInvites(owner, [newHire.id])).toMatchObject([
    { offered: false, invitedAt: expect.any(Date) as unknown },
  ]);
  await postFakeControl(fakeConnectors.url, `linear/invitations/${newHire.email}/expire`);
  await linear.scans.scanNow(owner, linear.connectionId);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await service.readAppInvites(owner, [newHire.id])).toMatchObject([
    { offered: true, invitedAt: null },
  ]);
});

test("keeps the first-seen date when a second scan sees the same undated invitation", async ({
  workspace: { owner, service, linear },
  seed,
}) => {
  const newHire = await seed.employee({ email: "new.hire@acme.example" });
  const [first] = await service.readAppInvites(owner, [newHire.id]);
  expect(first?.invitedAt).toBeInstanceOf(Date);
  await linear.scans.scanNow(owner, linear.connectionId);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  const scan = await linear.scans.readScan(owner, linear.connectionId);
  expect(scan?.status).toBe("scanned");
  expect(scan!.readAt!.getTime()).toBeGreaterThan(first!.invitedAt!.getTime());
  expect(await service.readAppInvites(owner, [newHire.id])).toMatchObject([
    { invitedAt: first!.invitedAt, offered: false },
  ]);
});
