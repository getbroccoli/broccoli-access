import {
  accountChanges,
  expect,
  expectBlockedBy,
  holdBeforeCommit,
  inviteTest as test,
  recordingJobQueue,
  storedApps,
  storedAppAccounts,
  templates,
  withLockTimeout,
  SYSTEM,
} from "#test/support";
import { createAppAccountService } from "./appAccountService";

test.for(["assign", "addApp"] as const)(
  "%s waits for Ivan's pending invite before adding a conflicting template role",
  async (operation, { workspace, seed, orm, transact, fakeConnectors }) => {
    const { assignLinearRole, templates, owner, input } = workspace;
    const { employeeId, appId } = input;
    await assignLinearRole("admin");
    const template = await seed.template({ appIds: operation === "assign" ? [appId] : [] });
    if (operation === "addApp")
      await seed.employeeTemplate({
        templateId: template.id,
        employeeId,
        assignedBy: owner.user!.userId,
      });

    const held = holdBeforeCommit(transact);
    const { jobs, sent } = recordingJobQueue();
    const service = accountChanges(orm, {
      transact: held.transact,
      connectorsUrl: fakeConnectors.url,
      jobs,
    });
    const invite = service.inviteEmployee(owner, input);
    const pid = await held.ready;
    const adding =
      operation === "assign"
        ? templates.assign(owner, { id: template.id, employeeId })
        : templates.addApp(owner, { id: template.id, appId });
    try {
      await expectBlockedBy(orm, pid, adding);
      const [before] = await templates.readEmployeeApps(owner, [employeeId]);
      expect(before!.find((app) => app.appId === appId)).toMatchObject({
        role: "admin",
        roleConflict: false,
      });
    } finally {
      held.release();
      await Promise.all([invite, adding]);
    }

    expect((await invite).latestInvite?.role).toBe("admin");
    expect(sent).toHaveLength(1);
    const [apps] = await templates.readEmployeeApps(owner, [employeeId]);
    expect(apps!.find((app) => app.appId === appId)).toMatchObject({ roleConflict: true });
  },
);

test("Slack's account sync finishes while a Linear invite waits for a template change", async ({
  workspace: { service, owner, input, assignLinearRole, employee },
  orm,
  transact,
  seed,
}) => {
  const { id } = await assignLinearRole("admin");
  const slack = (await storedApps(orm)).find((app) => app.catalogKey === "slack")!;
  const connection = await seed.appConnection({ appId: slack.id, connector: "slack" });
  const ana = employee("ana@acme.example");
  const account = {
    appId: slack.id,
    email: ana.email,
    employeeId: ana.id,
    status: "active",
    grantedAt: null,
    grantedBefore: null,
  } as const;
  const held = holdBeforeCommit(transact);
  const takingOff = templates(orm, { transact: held.transact }).takeOff(owner, {
    id,
    employeeId: input.employeeId,
  });
  const pid = await held.ready;
  const invite = service.inviteEmployee(owner, input);
  try {
    await expectBlockedBy(orm, pid);
    await withLockTimeout(transact)((tx) =>
      createAppAccountService().syncAccounts(SYSTEM, tx, {
        connectionId: connection.id,
        findingKind: "slack_members",
        readStartedAt: new Date(),
        cause: { kind: "FOUND_BY_SCAN", ref: connection.id },
        accounts: [account],
      }),
    );
    expect(await storedAppAccounts(orm)).toContainEqual(
      expect.objectContaining({
        appId: slack.id,
        email: ana.email,
        foundVia: expect.arrayContaining(["slack_members"]) as unknown,
      }),
    );
  } finally {
    held.release();
    await Promise.all([takingOff, invite]);
  }
});
