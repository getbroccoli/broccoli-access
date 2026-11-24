import {
  accountChanges,
  containerConnectors,
  expect,
  personPages,
  scannedLinear,
  SYSTEM,
  templates,
  test,
} from "#test/support";

test("one person-page read keeps a template chip and its app source together during take-off", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const employee = await seed.employee();
  const app = await seed.app({ status: "approved" });
  const template = await seed.template({ appIds: [app.id] });
  await seed.employeeTemplate({
    employeeId: employee.id,
    templateId: template.id,
    assignedBy: owner.user!.userId,
  });
  await seed.appAccount({ employeeId: employee.id, appId: app.id });
  const read = personPages(orm, {
    afterAssignments: async () => {
      await templates(orm).takeOff(owner, { id: template.id, employeeId: employee.id });
    },
  });

  const during = await read(owner, [employee.id]);
  const after = await personPages(orm)(owner, [employee.id]);

  expect(during).toMatchObject([
    {
      templates: [{ id: template.id }],
      personApps: [
        {
          appId: app.id,
          state: "active",
          templates: [{ id: template.id }],
        },
      ],
    },
  ]);
  expect(after).toMatchObject([
    { templates: [], personApps: [{ appId: app.id, state: "extra", templates: [] }] },
  ]);
});

test("the app row and offered action describe the same account during Enable", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const hannah = await seed.employee({ email: "hannah@acme.example" });
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const account = linear.account(hannah.email);
  const template = await seed.template({ appIds: [linear.appId] });
  await seed.employeeTemplate({
    employeeId: hannah.id,
    templateId: template.id,
    assignedBy: owner.user!.userId,
  });
  const connectors = containerConnectors(fakeConnectors.url);
  const changes = accountChanges(orm, { connectors });
  const read = personPages(orm, {
    connectors,
    afterAssignments: async () => {
      const change = await changes.changeAccount(owner, {
        appAccountId: account.id,
        action: "reactivate",
      });
      await changes.runChange(SYSTEM, change.id);
    },
  });

  const during = await read(owner, [hannah.id]);
  const after = await personPages(orm, { connectors })(owner, [hannah.id]);

  expect(during).toMatchObject([
    {
      personApps: [{ appId: linear.appId, state: "missing" }],
      appAccounts: [
        { id: account.id, status: "suspended", changeState: { offeredChange: "reactivate" } },
      ],
    },
  ]);
  expect(after).toMatchObject([
    {
      personApps: [{ appId: linear.appId, state: "active" }],
      appAccounts: [
        { id: account.id, status: "active", changeState: { offeredChange: "suspend" } },
      ],
    },
  ]);
});
