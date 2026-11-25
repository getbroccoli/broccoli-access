import {
  ADMIN,
  expect,
  inviteTest as test,
  recordHistory,
  storedEmployeeAppChoices,
} from "#test/support";

test("an app added for Ivan alone is missing with its role until he has an account", async ({
  workspace: { templates, owner, input },
}) => {
  await templates.addPersonApp(owner, { ...input, role: "admin" });

  const [apps] = await templates.readEmployeeApps(owner, [input.employeeId]);
  expect(apps!.find(({ appId }) => appId === input.appId)).toMatchObject({
    choice: "added",
    role: "admin",
    templates: [],
    state: "missing",
  });
});

test("adding the same app twice keeps one choice and one history line", async ({
  workspace: { templates, owner, input },
  orm,
}) => {
  await templates.addPersonApp(owner, { ...input, role: null });
  await templates.addPersonApp(owner, { ...input, role: null });

  expect(await storedEmployeeAppChoices(orm)).toEqual([{ ...input, choice: "added", role: null }]);
  const history = await recordHistory.read(orm, "employee", input.employeeId, { first: 5 });
  const choices = history.edges
    .flatMap(({ node }) => node.changes)
    .filter(({ field }) => field === "appChoice");
  expect(choices).toMatchObject([{ newValue: input.appId, newLabel: "Linear — added" }]);
});

test("refuses to add an app that one of Ivan's templates already gives", async ({
  workspace: { assignLinearRole, templates, owner, input },
  orm,
}) => {
  await assignLinearRole(null);

  await expect(templates.addPersonApp(owner, { ...input, role: null })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "A template already gives this person the app.",
  });
  expect(await storedEmployeeAppChoices(orm)).toEqual([]);
});

test("refuses to add an app the company has not approved", async ({
  workspace: { templates, owner, input },
  seed,
}) => {
  const discovered = await seed.app({
    name: "Intranet",
    domain: "intranet.example.com",
    catalogKey: null,
  });

  await expect(
    templates.addPersonApp(owner, { ...input, appId: discovered.id, role: null }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "appId", code: "invalid" }],
  });
});

test("refuses to add an app with a role Linear does not list", async ({
  workspace: { templates, owner, input },
}) => {
  await expect(templates.addPersonApp(owner, { ...input, role: "member" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "role", code: "invalid" }],
  });
});

test("refuses to add an app for Ana, who is suspended in the directory", async ({
  workspace: { templates, owner, input, employee },
}) => {
  const ana = employee("ana@acme.example");

  await expect(
    templates.addPersonApp(owner, { ...input, employeeId: ana.id, role: null }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "employeeId", code: "invalid" }],
  });
});

test("an app removed for Ivan is no longer missing for him and stays missing for Elif", async ({
  workspace: { templates, owner, input, employee },
  seed,
}) => {
  const elif = employee("elif@acme.example");
  const template = await seed.template({ appIds: [input.appId] });
  const assignment = { templateId: template.id, assignedBy: owner.user!.userId };
  await seed.employeeTemplate({ ...assignment, employeeId: input.employeeId });
  await seed.employeeTemplate({ ...assignment, employeeId: elif.id });

  await templates.removePersonApp(owner, input);

  const linearOf = (apps: Awaited<ReturnType<typeof templates.readEmployeeApps>>[number]) =>
    apps.find(({ appId }) => appId === input.appId);
  const [ivans, elifs] = await templates.readEmployeeApps(owner, [input.employeeId, elif.id]);
  expect(linearOf(ivans!)).toMatchObject({
    choice: "removed",
    state: null,
    templates: [{ id: template.id }],
  });
  expect(linearOf(elifs!)).toMatchObject({ choice: null, state: "missing" });
  expect((await templates.readTemplate(owner, template.id))!.apps).toHaveLength(1);
});

test("refuses to remove an app that none of Ivan's templates gives", async ({
  workspace: { templates, owner, input },
  orm,
}) => {
  await expect(templates.removePersonApp(owner, input)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "No template gives this person the app.",
  });
  expect(await storedEmployeeAppChoices(orm)).toEqual([]);
});

test("undoing a removal deletes the choice and the app is missing again", async ({
  workspace: { assignLinearRole, templates, owner, input },
  orm,
}) => {
  await assignLinearRole(null);
  await templates.removePersonApp(owner, input);

  await templates.undoPersonAppChoice(owner, input);

  expect(await storedEmployeeAppChoices(orm)).toEqual([]);
  const [apps] = await templates.readEmployeeApps(owner, [input.employeeId]);
  expect(apps!.find(({ appId }) => appId === input.appId)).toMatchObject({
    choice: null,
    state: "missing",
  });
});

test("a removal and its undo each leave a history line on the employee", async ({
  workspace: { assignLinearRole, templates, owner, input },
  orm,
}) => {
  await assignLinearRole(null);

  await templates.removePersonApp(owner, input);
  await templates.undoPersonAppChoice(owner, input);

  const history = await recordHistory.read(orm, "employee", input.employeeId, { first: 2 });
  expect(history.edges.map(({ node }) => node)).toMatchObject([
    {
      author: { id: owner.user!.userId },
      changes: [
        { field: "appChoice", oldValue: input.appId, oldLabel: "Linear — removed", newValue: null },
      ],
    },
    {
      author: { id: owner.user!.userId },
      changes: [
        { field: "appChoice", oldValue: null, newValue: input.appId, newLabel: "Linear — removed" },
      ],
    },
  ]);
});

test("adding the app again with another role records the role change", async ({
  workspace: { templates, owner, input },
  orm,
}) => {
  await templates.addPersonApp(owner, { ...input, role: null });

  await templates.addPersonApp(owner, { ...input, role: "admin" });

  const history = await recordHistory.read(orm, "employee", input.employeeId, { first: 1 });
  expect(history.edges[0]!.node.changes).toMatchObject([
    {
      field: "appChoice",
      oldValue: input.appId,
      oldLabel: "Linear — added",
      newValue: input.appId,
      newLabel: "Linear — added as admin",
    },
  ]);
});

test("adding an app marked for review records the review it ends", async ({
  workspace: { templates, owner, input, employee },
  seed,
  orm,
}) => {
  const chloe = { employeeId: employee("chloe@acme.example").id, appId: input.appId };
  await seed.employeeAppChoice({ ...chloe, choice: "to_review" });

  await templates.addPersonApp(owner, { ...chloe, role: null });

  const history = await recordHistory.read(orm, "employee", chloe.employeeId, { first: 1 });
  expect(history.edges[0]!.node.changes).toMatchObject([
    {
      field: "appChoice",
      oldValue: chloe.appId,
      oldLabel: "Linear — to review",
      newValue: chloe.appId,
      newLabel: "Linear — added",
    },
  ]);
});

test("undoing an added app marks Chloé's active account in it for review", async ({
  workspace: { templates, owner, input, employee },
  orm,
}) => {
  const chloe = { employeeId: employee("chloe@acme.example").id, appId: input.appId };
  await templates.addPersonApp(owner, { ...chloe, role: null });

  await templates.undoPersonAppChoice(owner, chloe);

  expect(await storedEmployeeAppChoices(orm)).toEqual([
    { ...chloe, choice: "to_review", role: null },
  ]);
  const [apps] = await templates.readEmployeeApps(owner, [chloe.employeeId]);
  expect(apps!.find(({ appId }) => appId === input.appId)).toMatchObject({
    choice: null,
    state: "extra",
  });
});

test.for(["addPersonApp", "removePersonApp", "undoPersonAppChoice"] as const)(
  "only the owner can call %s",
  async (operation, { workspace: { templates, input }, orm }) => {
    await expect(templates[operation](ADMIN, { ...input, role: null })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await storedEmployeeAppChoices(orm)).toEqual([]);
  },
);
