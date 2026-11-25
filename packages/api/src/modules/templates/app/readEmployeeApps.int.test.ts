import {
  containerConnectors,
  expect,
  inviteTest,
  OWNER,
  postFakeControl,
  SYSTEM,
  templates,
  test,
} from "#test/support";

test("lists a shared app once with both template sources and the apps each template adds", async ({
  orm,
  seed,
}) => {
  const user = await seed.user({ email: "owner@example.com" });
  const ivan = await seed.employee();
  const nobodyAssigned = await seed.employee();
  const slack = await seed.app({ status: "approved" });
  const linear = await seed.app({
    name: "Linear",
    domain: "linear.app",
    catalogKey: "linear",
    status: "approved",
  });
  const figma = await seed.app({
    name: "Figma",
    domain: "figma.com",
    catalogKey: "figma",
    status: "approved",
  });
  const everyone = await seed.template({ name: "Everyone", appIds: [slack.id, figma.id] });
  const engineer = await seed.template({ name: "Engineer", appIds: [linear.id, slack.id] });
  const assignment = { employeeId: ivan.id, assignedBy: user.id };
  await seed.employeeTemplate({ ...assignment, templateId: everyone.id });
  await seed.employeeTemplate({ ...assignment, templateId: engineer.id });
  await seed.appAccount({ employeeId: ivan.id, appId: figma.id });
  await seed.appAccount({ employeeId: ivan.id, appId: figma.id, status: "suspended" });
  await seed.appAccount({ employeeId: ivan.id, appId: slack.id, status: "suspended" });

  const [empty, rows] = await templates(orm).readEmployeeApps(OWNER, [nobodyAssigned.id, ivan.id]);

  const fromEveryone: unknown = expect.objectContaining({ id: everyone.id, name: everyone.name });
  const fromEngineer: unknown = expect.objectContaining({ id: engineer.id, name: engineer.name });
  expect(empty).toEqual([]);
  expect(rows).toHaveLength(3);
  expect.soft(rows).toContainEqual({
    appId: figma.id,
    accountStatus: "active",
    templates: [fromEveryone],
    role: null,
    roleConflict: false,
    choice: null,
    state: "active",
  });
  expect.soft(rows).toContainEqual({
    appId: linear.id,
    accountStatus: null,
    templates: [fromEngineer],
    role: null,
    roleConflict: false,
    choice: null,
    state: "not_connected",
  });
  const shared = rows!.find(({ appId }) => appId === slack.id);
  expect.soft(shared).toMatchObject({
    accountStatus: "suspended",
    role: null,
    roleConflict: false,
    state: "missing",
  });
  expect(shared!.templates).toHaveLength(2);
  expect(shared!.templates).toEqual(expect.arrayContaining([fromEveryone, fromEngineer]));
});

test("marks only active accounts in another template as extra once the person has a template", async ({
  orm,
  seed,
}) => {
  const user = await seed.user({ email: "owner@example.com" });
  const withTemplate = await seed.employee();
  const withoutTemplate = await seed.employee();
  const listed = await seed.app({ status: "approved" });
  const quiet = await seed.app({
    name: "Figma",
    domain: "figma.com",
    catalogKey: "figma",
    status: "approved",
  });
  const suspended = await seed.app({
    name: "Linear",
    domain: "linear.app",
    catalogKey: "linear",
    status: "approved",
  });
  await seed.appConnection({ appId: suspended.id, connector: "linear" });
  await seed.template({ appIds: [listed.id, suspended.id] });
  const empty = await seed.template();
  await seed.employeeTemplate({
    employeeId: withTemplate.id,
    templateId: empty.id,
    assignedBy: user.id,
  });
  await seed.appAccount({ employeeId: withTemplate.id, appId: listed.id });
  await seed.appAccount({ employeeId: withTemplate.id, appId: quiet.id });
  await seed.appAccount({ employeeId: withTemplate.id, appId: suspended.id, status: "suspended" });
  await seed.appAccount({ employeeId: withoutTemplate.id, appId: listed.id });

  const [without, withApps] = await templates(orm).readEmployeeApps(OWNER, [
    withoutTemplate.id,
    withTemplate.id,
  ]);

  const account = { templates: [], role: null };
  expect(without).toMatchObject([{ ...account, appId: listed.id, state: "active" }]);
  expect(withApps).toHaveLength(3);
  expect(withApps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ...account, appId: listed.id, state: "extra" }),
      expect.objectContaining({ ...account, appId: quiet.id, state: "active" }),
      expect.objectContaining({ ...account, appId: suspended.id, state: "suspended" }),
    ]),
  );
});

inviteTest(
  "marks a desired app invited after an invite succeeds and missing after a scan finds it expired",
  async ({ workspace: { owner, service, ivan, linear, input }, seed, orm, fakeConnectors }) => {
    const template = await seed.template({ appIds: [linear.appId] });
    await seed.employeeTemplate({
      employeeId: ivan.id,
      templateId: template.id,
      assignedBy: owner.user!.userId,
    });
    const { latestInvite } = await service.inviteEmployee(owner, input);
    await service.runChange(SYSTEM, latestInvite!.id);
    const read = templates(orm, { connectors: containerConnectors(fakeConnectors.url) });
    const linearState = async () => {
      const [apps] = await read.readEmployeeApps(owner, [ivan.id]);
      return apps!.find(({ appId }) => appId === linear.appId)?.state;
    };
    expect(await linearState()).toBe("invited");

    await postFakeControl(fakeConnectors.url, `linear/invitations/${ivan.email}/expire`);
    await linear.scans.scanNow(owner, linear.connectionId);
    await linear.scans.runScan(SYSTEM, linear.sourceId);

    expect(await linearState()).toBe("missing");
  },
);
