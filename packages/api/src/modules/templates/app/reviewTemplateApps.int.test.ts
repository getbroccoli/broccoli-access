import {
  expect,
  OWNER,
  storedEmployeeAppChoices,
  storedRecordHistory,
  templates,
  test,
} from "#test/support";

test("taking a template off keeps the other sources and records each new review choice only once", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const ivan = await seed.employee();
  const ana = await seed.employee();
  const active = await seed.app({ status: "approved" });
  const notion = await seed.app({
    name: "Notion",
    domain: "notion.so",
    catalogKey: "notion",
    status: "approved",
  });
  const shared = await seed.app({
    name: "Linear",
    domain: "linear.app",
    catalogKey: "linear",
    status: "approved",
  });
  const suspended = await seed.app({
    name: "Figma",
    domain: "figma.com",
    catalogKey: "figma",
    status: "approved",
  });
  const engineer = await seed.template({ appIds: [active.id, notion.id, shared.id, suspended.id] });
  const everyone = await seed.template({ appIds: [shared.id] });
  const assignment = {
    employeeId: ivan.id,
    templateId: engineer.id,
    assignedBy: owner.user!.userId,
  };
  await seed.employeeTemplate(assignment);
  await seed.employeeTemplate({ ...assignment, templateId: everyone.id });
  await seed.employeeTemplate({ ...assignment, employeeId: ana.id });
  await seed.appAccount({ employeeId: ivan.id, appId: active.id });
  await seed.appAccount({ employeeId: ana.id, appId: active.id });
  await seed.appAccount({ employeeId: ivan.id, appId: notion.id });
  await seed.appAccount({ employeeId: ivan.id, appId: suspended.id, status: "suspended" });
  await seed.appAccount({ employeeId: ivan.id, appId: shared.id });
  const service = templates(orm);
  const input = { id: engineer.id, employeeId: ivan.id };

  await service.takeOff(owner, input);
  await seed.employeeTemplate(assignment);
  await service.takeOff(owner, input);

  expect(await storedEmployeeAppChoices(orm)).toMatchObject([
    { employeeId: ivan.id, appId: active.id, choice: "to_review", role: null },
    { employeeId: ivan.id, appId: notion.id, choice: "to_review", role: null },
  ]);
  const changes = (await storedRecordHistory(orm))
    .filter((line) => line.recordType === "employee" && line.recordId === ivan.id)
    .flatMap((line) => line.changes)
    .filter((change) => change.field === "appChoice");
  expect(changes).toHaveLength(2);
  for (const app of [active, notion]) {
    expect(changes).toContainEqual(
      expect.objectContaining({
        oldValue: null,
        newValue: app.id,
        newLabel: `${app.name} — to review`,
      }),
    );
  }
});

test("taking the directory's app out of a template puts no directory account up for review", async ({
  orm,
  seed,
}) => {
  const user = await seed.user({ email: "owner@example.com" });
  const directory = await seed.app({ catalogKey: "google_workspace", status: "approved" });
  await seed.appConnection({ appId: directory.id, connector: "google_workspace" });
  const template = await seed.template({ appIds: [directory.id] });
  const ivan = await seed.employee();
  await seed.employeeTemplate({
    employeeId: ivan.id,
    templateId: template.id,
    assignedBy: user.id,
  });
  await seed.appAccount({ employeeId: ivan.id, appId: directory.id });

  await templates(orm).takeOutApp(OWNER, { id: template.id, appId: directory.id });

  expect(await storedEmployeeAppChoices(orm)).toEqual([]);
});

test.for(["taking out the app", "deleting the template"] as const)(
  "%s marks each active account that loses its last source for review",
  async (operation, { orm, seed }) => {
    const user = await seed.user({ email: "owner@example.com" });
    const app = await seed.app({ status: "approved" });
    const engineer = await seed.template({ appIds: [app.id] });
    const everyone = await seed.template({ appIds: [app.id] });
    const ivan = await seed.employee();
    const ana = await seed.employee();
    const retained = await seed.employee();
    const suspended = await seed.employee();
    const unrelated = await seed.employee();
    const absent = await seed.employee();
    for (const employee of [ivan, ana, retained, suspended, absent]) {
      await seed.employeeTemplate({
        employeeId: employee.id,
        templateId: engineer.id,
        assignedBy: user.id,
      });
    }
    await seed.employeeTemplate({
      employeeId: retained.id,
      templateId: everyone.id,
      assignedBy: user.id,
    });
    for (const employee of [ivan, ana, retained, unrelated]) {
      await seed.appAccount({ employeeId: employee.id, appId: app.id });
    }
    await seed.appAccount({ employeeId: suspended.id, appId: app.id, status: "suspended" });

    const service = templates(orm);
    if (operation === "taking out the app") {
      await service.takeOutApp(OWNER, { id: engineer.id, appId: app.id });
    } else {
      await service.deleteTemplate(OWNER, engineer.id);
    }

    const choices = await storedEmployeeAppChoices(orm);
    const review = { appId: app.id, choice: "to_review", role: null };
    expect(choices).toHaveLength(2);
    expect(choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ...review, employeeId: ivan.id }),
        expect.objectContaining({ ...review, employeeId: ana.id }),
      ]),
    );
    const history = (await storedRecordHistory(orm))
      .filter((line) => line.recordType === "employee")
      .flatMap((line) =>
        line.changes
          .filter((change) => change.field === "appChoice")
          .map((change) => ({
            employeeId: line.recordId,
            appId: change.newValue,
            label: change.newLabel,
          })),
      );
    expect(history).toHaveLength(2);
    expect(history).toEqual(
      expect.arrayContaining([
        { employeeId: ivan.id, appId: app.id, label: `${app.name} — to review` },
        { employeeId: ana.id, appId: app.id, label: `${app.name} — to review` },
      ]),
    );
  },
);

test.for([
  { choice: "added", role: "admin" },
  { choice: "removed", role: null },
] as const)(
  "taking off a template preserves the employee's $choice choice and its history",
  async (choice, { orm, seed }) => {
    const owner = await seed.owner();
    const employee = await seed.employee();
    const app = await seed.app({ status: "approved" });
    const template = await seed.template({ appIds: [app.id] });
    await seed.employeeTemplate({
      templateId: template.id,
      employeeId: employee.id,
      assignedBy: owner.user!.userId,
    });
    await seed.appAccount({ employeeId: employee.id, appId: app.id });
    const existing = { ...choice, employeeId: employee.id, appId: app.id };
    await seed.employeeAppChoice(existing);

    await templates(orm).takeOff(owner, { id: template.id, employeeId: employee.id });

    expect(await storedEmployeeAppChoices(orm)).toEqual([existing]);
    expect(
      (await storedRecordHistory(orm))
        .flatMap((line) => line.changes)
        .map((change) => change.field),
    ).toEqual(["template"]);
  },
);

test("deleting a shared template reviews only the account that lost its source and clears only the stale pick", async ({
  seed,
  orm,
}) => {
  const owner = await seed.owner();
  const assignedBy = owner.user!.userId;
  const ana = await seed.employee();
  const ivan = await seed.employee();
  const slack = await seed.app({ status: "approved" });
  const linear = await seed.app({
    name: "Linear",
    domain: "linear.app",
    catalogKey: "linear",
    status: "approved",
  });
  await seed.appConnection({ appId: slack.id, connector: "slack" });
  await seed.appConnection({ appId: linear.id, connector: "linear" });
  const everyone = await seed.template({ appIds: [slack.id, linear.id] });
  for (const employeeId of [ana.id, ivan.id])
    await seed.employeeTemplate({ employeeId, templateId: everyone.id, assignedBy });
  const anaSlack = { employeeId: ana.id, appId: slack.id };
  const ivanLinear = { employeeId: ivan.id, appId: linear.id };
  await seed.assignedTemplateApp({ ...anaSlack, role: "admin", assignedBy });
  await seed.assignedTemplateApp({ ...anaSlack, role: null, assignedBy });
  await seed.assignedTemplateApp({ ...ivanLinear, role: "admin", assignedBy });
  const kept = { ...anaSlack, choice: "role_picked" as const, role: "admin" };
  await seed.employeeAppChoice(kept);
  await seed.employeeAppChoice({ ...ivanLinear, choice: "role_picked", role: null });
  const ivanSlack = { employeeId: ivan.id, appId: slack.id };
  await seed.appAccount(ivanSlack);
  await seed.appAccount(anaSlack);

  await templates(orm).deleteTemplate(owner, everyone.id);

  const choices = await storedEmployeeAppChoices(orm);
  expect(choices).toHaveLength(2);
  expect(choices).toEqual(
    expect.arrayContaining([kept, { ...ivanSlack, choice: "to_review", role: null }]),
  );
});
