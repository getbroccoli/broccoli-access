import {
  ADMIN,
  containerConnectors,
  EMPLOYEE,
  expect,
  inviteTest,
  postFakeControl,
  startFakeHttpServer,
  SYSTEM,
  templates,
  test,
} from "#test/support";

inviteTest(
  "Missing includes Hannah's disabled account and clears Ivan after his invitation",
  async ({ workspace: { owner, input, service, templates, assignLinearRole, employee }, seed }) => {
    const template = await assignLinearRole(null);
    const hannah = employee("hannah@acme.example");
    await seed.employeeTemplate({
      employeeId: hannah.id,
      templateId: template.id,
      assignedBy: owner.user!.userId,
    });
    const { latestInvite } = await service.inviteEmployee(owner, input);
    await service.runChange(SYSTEM, latestInvite!.id);

    // Ivan already uses Notion, which no template lists. Unassigned people already use Linear.
    expect(await templates.readDifferences(ADMIN)).toMatchObject({
      missing: [{ employeeId: hannah.id, appId: input.appId }],
      extra: [],
      templateSummaries: new Map([
        [template.id, { missingCount: 1, extraCount: 0, missingAppId: input.appId }],
      ]),
    });
  },
);

inviteTest(
  "a queued invite appears by ID and stays Missing until the invite succeeds",
  async ({ workspace: { owner, input, service, templates, assignLinearRole } }) => {
    await assignLinearRole(null);
    const { latestInvite } = await service.inviteEmployee(owner, input);

    expect.soft(await templates.readDifferences(owner)).toMatchObject({
      runningChangeIds: [latestInvite!.id],
      missing: [input],
    });

    await service.runChange(SYSTEM, latestInvite!.id);

    expect(await templates.readDifferences(owner)).toMatchObject({
      runningChangeIds: [],
      missing: [],
    });
  },
);

inviteTest(
  "a scanned pending invitation stays out of Missing when the connector manifest is unavailable",
  async ({
    workspace: { owner, ivan, linear, assignLinearRole, templates: online },
    fakeConnectors,
    orm,
  }) => {
    await assignLinearRole(null);
    await postFakeControl(fakeConnectors.url, "linear/invitations", { email: ivan.email });
    await linear.scans.scanNow(owner, linear.connectionId);
    await linear.scans.runScan(SYSTEM, linear.sourceId);
    expect((await online.readDifferences(owner)).missing).toEqual([]);

    const unavailable = await startFakeHttpServer(() => ({ status: 503 }));
    try {
      const offline = templates(orm, { connectors: containerConnectors(unavailable.url) });
      expect((await offline.readDifferences(owner)).missing).toEqual([]);
    } finally {
      await unavailable.stop();
    }
  },
);

test("an employee cannot read workspace differences", async ({ orm }) => {
  await expect(templates(orm).readDifferences(EMPLOYEE)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
