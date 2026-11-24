import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  templates,
  storedTemplateApps,
  storedRecordHistory,
} from "#test/support";

test("adds an approved app and records its name in the template history", async ({ orm, seed }) => {
  const template = await seed.template();
  const app = await seed.app({ status: "approved" });

  const updated = await templates(orm).addApp(OWNER, { id: template.id, appId: app.id });

  expect(updated).toMatchObject({
    id: template.id,
    apps: [{ id: expect.any(String) as unknown, appId: app.id }],
  });
  expect(await storedTemplateApps(orm)).toEqual([
    { id: updated.apps[0]!.id, templateId: template.id, appId: app.id, role: null },
  ]);
  expect(await storedRecordHistory(orm)).toMatchObject([
    {
      recordType: "template",
      recordId: template.id,
      operation: "updated",
      authorKind: "signed_in_user",
      authorId: "test-owner",
      causeKind: "edited_directly",
      changes: [{ field: "app", oldValue: null, newValue: app.id, newLabel: app.name }],
    },
  ]);
});

test("adding an app twice keeps the first membership and its single history line", async ({
  orm,
  seed,
}) => {
  const template = await seed.template();
  const app = await seed.app({ status: "approved" });
  const input = { id: template.id, appId: app.id };
  const service = templates(orm);
  const first = await service.addApp(OWNER, input);
  const history = await storedRecordHistory(orm);

  const again = await service.addApp(OWNER, input);

  expect(again).toEqual(first);
  expect(await storedTemplateApps(orm)).toEqual([
    { id: first.apps[0]!.id, templateId: template.id, appId: app.id, role: null },
  ]);
  expect(await storedRecordHistory(orm)).toEqual(history);
});

test.for(["discovered", "ignored"] as const)(
  "refuses to add a %s app",
  async (status, { orm, seed }) => {
    const template = await seed.template();
    const app = await seed.app({ status });

    await expect(
      templates(orm).addApp(OWNER, { id: template.id, appId: app.id }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "appId", code: "invalid" }],
    });
    expect(await storedTemplateApps(orm)).toEqual([]);
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test.for(["00000000-0000-4000-8000-000000000001", "not-an-id"])(
  "refuses to add a missing app (%s)",
  async (appId, { orm, seed }) => {
    const template = await seed.template();

    await expect(templates(orm).addApp(OWNER, { id: template.id, appId })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "appId", code: "invalid" }],
    });
    expect(await storedTemplateApps(orm)).toEqual([]);
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test("takes out an app and records its former name in the template history", async ({
  orm,
  seed,
}) => {
  const app = await seed.app({ status: "approved" });
  const template = await seed.template({ appIds: [app.id] });

  const updated = await templates(orm).takeOutApp(OWNER, { id: template.id, appId: app.id });

  expect(updated).toMatchObject({ id: template.id, apps: [] });
  expect(await storedTemplateApps(orm)).toEqual([]);
  expect(await storedRecordHistory(orm)).toMatchObject([
    {
      recordType: "template",
      recordId: template.id,
      operation: "updated",
      authorKind: "signed_in_user",
      authorId: "test-owner",
      causeKind: "edited_directly",
      changes: [{ field: "app", oldValue: app.id, oldLabel: app.name, newValue: null }],
    },
  ]);
});

test("taking out an app outside the template preserves its members and history", async ({
  orm,
  seed,
}) => {
  const member = await seed.app({ status: "approved" });
  const other = await seed.app({
    name: "Figma",
    domain: "figma.com",
    catalogKey: "figma",
    status: "approved",
  });
  const template = await seed.template({ appIds: [member.id] });
  const before = await storedTemplateApps(orm);

  const updated = await templates(orm).takeOutApp(OWNER, { id: template.id, appId: other.id });

  expect(updated).toMatchObject({
    id: template.id,
    apps: [{ id: before[0]!.id, appId: member.id }],
  });
  expect(await storedTemplateApps(orm)).toEqual(before);
  expect(await storedRecordHistory(orm)).toEqual([]);
});

test.for(["00000000-0000-4000-8000-000000000001", "not-an-id"])(
  "refuses app changes to a missing template (%s)",
  async (id, { orm, seed }) => {
    const app = await seed.app({ status: "approved" });
    const service = templates(orm);
    const input = { id, appId: app.id };
    const error = { code: "NOT_FOUND", message: "No template has this id." };

    await expect(service.addApp(OWNER, input)).rejects.toMatchObject(error);
    await expect(service.takeOutApp(OWNER, input)).rejects.toMatchObject(error);
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test("refuses to add an app without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const template = await seed.template();
  const app = await seed.app({ status: "approved" });

  await expect(
    templates(orm).addApp(EMPLOYEE, { id: template.id, appId: app.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await storedTemplateApps(orm)).toEqual([]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});

test("refuses to take out an app without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const app = await seed.app({ status: "approved" });
  const template = await seed.template({ appIds: [app.id] });
  const before = await storedTemplateApps(orm);

  await expect(
    templates(orm).takeOutApp(EMPLOYEE, { id: template.id, appId: app.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await storedTemplateApps(orm)).toEqual(before);
  expect(await storedRecordHistory(orm)).toEqual([]);
});
