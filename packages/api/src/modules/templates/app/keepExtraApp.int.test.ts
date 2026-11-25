import {
  ADMIN,
  expect,
  inviteTest as test,
  recordHistory,
  storedEmployeeAppChoices,
} from "#test/support";

test("keeping the extra account after taking off the last template records the choice once", async ({
  workspace: { templates, owner, employee, linear },
  seed,
  orm,
}) => {
  const chloe = employee("chloe@acme.example");
  const employeeId = chloe.id;
  const pair = { employeeId, appId: linear.appId };
  const template = await seed.assignedTemplateApp({
    ...pair,
    role: null,
    assignedBy: owner.user!.userId,
  });
  await templates.takeOff(owner, { employeeId, id: template.id });
  expect(await templates.readDifferences(owner)).toMatchObject({
    missing: [],
    extra: [{ ...pair, reason: "review", accountIds: [linear.account(chloe.email).id] }],
    templateSummaries: new Map(),
  });

  expect(await templates.keepExtraApp(owner, pair)).toBe(employeeId);
  expect(await templates.keepExtraApp(owner, pair)).toBe(employeeId);

  expect(await templates.readDifferences(owner)).toMatchObject({
    missing: [],
    extra: [],
    templateSummaries: new Map(),
  });
  expect(await storedEmployeeAppChoices(orm)).toEqual([{ ...pair, choice: "added", role: null }]);
  const history = await recordHistory.read(orm, "employee", employeeId, { first: 10 });
  const choices = history.edges
    .flatMap(({ node }) => node.changes)
    .filter(({ field }) => field === "appChoice");
  expect(choices).toMatchObject([
    {
      oldValue: pair.appId,
      oldLabel: "Linear — to review",
      newValue: pair.appId,
      newLabel: "Linear — added",
    },
    { oldValue: null, newLabel: "Linear — to review" },
  ]);
});

test("keeping a suspended person's extra account clears the mark on all their templates", async ({
  workspace: { templates, owner, employee, linear },
  seed,
  orm,
}) => {
  const employeeId = employee("ana@acme.example").id;
  const pair = { employeeId, appId: linear.appId };
  await seed.template({ appIds: [linear.appId] });
  const engineer = await seed.template();
  const everyone = await seed.template();
  for (const templateId of [engineer.id, everyone.id]) {
    await seed.employeeTemplate({ employeeId, templateId, assignedBy: owner.user!.userId });
  }
  const summary = { missingCount: 0, extraCount: 1, missingAppId: null };
  expect(await templates.readDifferences(owner)).toMatchObject({
    missing: [],
    extra: [pair],
    templateSummaries: new Map([
      [engineer.id, summary],
      [everyone.id, summary],
    ]),
  });

  await templates.keepExtraApp(owner, pair);

  expect(await storedEmployeeAppChoices(orm)).toEqual([{ ...pair, choice: "added", role: null }]);
  expect(await templates.readDifferences(owner)).toMatchObject({
    missing: [],
    extra: [],
    templateSummaries: new Map(),
  });
});

test("keeping an account replaces a removal even when an assigned template gives the app", async ({
  workspace: { templates, owner, employee, linear },
  seed,
  orm,
}) => {
  const pair = { employeeId: employee("chloe@acme.example").id, appId: linear.appId };
  await seed.assignedTemplateApp({ ...pair, assignedBy: owner.user!.userId, role: null });
  await seed.employeeAppChoice({ ...pair, choice: "removed" });

  await templates.keepExtraApp(owner, pair);

  expect(await storedEmployeeAppChoices(orm)).toEqual([{ ...pair, choice: "added", role: null }]);
  expect(await templates.readDifferences(owner)).toMatchObject({
    missing: [],
    extra: [],
    templateSummaries: new Map(),
  });
});

test("Keep refuses an account that an assigned template now gives", async ({
  workspace: { templates, owner, employee, linear },
  seed,
  orm,
}) => {
  const pair = { employeeId: employee("chloe@acme.example").id, appId: linear.appId };
  await seed.assignedTemplateApp({ ...pair, role: null, assignedBy: owner.user!.userId });

  await expect(templates.keepExtraApp(owner, pair)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This app is no longer extra for this person.",
  });
  expect(await storedEmployeeAppChoices(orm)).toEqual([]);
});

test("an admin cannot keep an extra account", async ({
  workspace: { templates, employee, linear },
  seed,
  orm,
}) => {
  const pair = { employeeId: employee("chloe@acme.example").id, appId: linear.appId };
  await seed.employeeAppChoice({ ...pair, choice: "to_review" });

  await expect(templates.keepExtraApp(ADMIN, pair)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await storedEmployeeAppChoices(orm)).toEqual([
    { ...pair, choice: "to_review", role: null },
  ]);
});

test("a removal stays on the person page but cannot be kept once no template lists the app", async ({
  workspace: { templates, employee, linear, owner },
  seed,
}) => {
  const pair = { employeeId: employee("chloe@acme.example").id, appId: linear.appId };
  const template = await seed.assignedTemplateApp({
    ...pair,
    role: null,
    assignedBy: owner.user!.userId,
  });
  await seed.employeeAppChoice({ ...pair, choice: "removed" });
  await templates.takeOutApp(owner, { id: template.id, appId: linear.appId });

  const [apps] = await templates.readEmployeeApps(owner, [pair.employeeId]);
  expect(apps!.find(({ appId }) => appId === pair.appId)?.choice).toBe("removed");
  expect.soft((await templates.readDifferences(owner)).extra).toEqual([]);
  await expect(templates.keepExtraApp(owner, pair)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This app is no longer extra for this person.",
  });
});

test("Keep refuses an extra account while its Disable is running", async ({
  workspace: { owner, employee, linear, service, templates },
  seed,
  orm,
}) => {
  const chloe = employee("chloe@acme.example");
  const pair = { employeeId: chloe.id, appId: linear.appId };
  await seed.employeeAppChoice({ ...pair, choice: "to_review" });
  await service.changeAccount(owner, {
    appAccountId: linear.account(chloe.email).id,
    action: "suspend",
  });

  await expect(templates.keepExtraApp(owner, pair)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "A Disable is still running for this app.",
  });
  expect(await storedEmployeeAppChoices(orm)).toEqual([
    { ...pair, choice: "to_review", role: null },
  ]);
});
