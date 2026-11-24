import {
  ADMIN,
  containerConnectors,
  expect,
  inviteTest as test,
  recordHistory,
  serveManifest,
  storedEmployeeAppChoices,
  storedRecordHistory,
  templates,
} from "#test/support";
import { ApplicationError } from "../../../core/applicationError";

test.for([
  { label: "a cleared role", value: null },
  { label: "Linear's explicit default", value: "user" },
])(
  "stores $label as a template app with no role override",
  async ({ value }, { workspace: { assignLinearRole, templates, owner, input } }) => {
    const { id } = await assignLinearRole("admin");

    const updated = await templates.setAppRole(owner, { id, appId: input.appId, role: value });

    const expected = { id, apps: [{ appId: input.appId, role: null }] };
    expect(updated).toMatchObject(expected);
    expect(await templates.readTemplate(owner, id)).toMatchObject(expected);
  },
);

test("refuses a role that Linear does not list", async ({
  workspace: { assignLinearRole, templates, owner, input },
}) => {
  const { id } = await assignLinearRole(null);

  await expect(
    templates.setAppRole(owner, { id, appId: input.appId, role: "member" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "role", code: "invalid" }],
  });
});

test("refuses a role when the connected app's manifest lists none", async ({
  workspace: { assignLinearRole, owner, input },
  orm,
  fakeConnectors,
}) => {
  const { id } = await assignLinearRole(null);
  const server = await serveManifest(fakeConnectors.url, ({ connectors }) => {
    delete connectors.find(({ key }) => key === "linear")!.roles;
  });
  const service = templates(orm, { connectors: containerConnectors(server.url) });

  await expect(
    service.setAppRole(owner, { id, appId: input.appId, role: "admin" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "role", code: "invalid" }],
  });
});

test("two templates granting the same Linear role give Ivan that role without a conflict", async ({
  workspace: { assignLinearRole, templates, owner, input },
}) => {
  await assignLinearRole("guest");
  await assignLinearRole("guest");

  const [apps] = await templates.readEmployeeApps(owner, [input.employeeId]);

  expect(apps!.find(({ appId }) => appId === input.appId)).toMatchObject({
    role: "guest",
    roleConflict: false,
  });
});

test.for([
  { pick: "default", role: null, expected: null },
  { pick: "Linear's named default", role: "user", expected: null },
  { pick: "admin", role: "admin", expected: "admin" },
])(
  "resolves Ivan's conflicting templates with the owner's pick of $pick",
  async ({ role, expected }, { workspace: { assignLinearRole, templates, owner, input } }) => {
    await assignLinearRole(null);
    await assignLinearRole("admin");

    await templates.pickRole(owner, { ...input, role });

    const [apps] = await templates.readEmployeeApps(owner, [input.employeeId]);
    expect(apps!.find(({ appId }) => appId === input.appId)).toMatchObject({
      role: expected,
      roleConflict: false,
    });
  },
);

test("refuses a listed Linear role that neither of Ivan's templates gives", async ({
  workspace: { assignLinearRole, templates, owner, input },
}) => {
  await assignLinearRole("admin");
  await assignLinearRole(null);

  await expect(templates.pickRole(owner, { ...input, role: "guest" })).rejects.toBeInstanceOf(
    ApplicationError,
  );
  const [apps] = await templates.readEmployeeApps(owner, [input.employeeId]);
  expect(apps!.find(({ appId }) => appId === input.appId)).toMatchObject({ roleConflict: true });
});

test("refuses a role pick when Ivan has only one source role", async ({
  workspace: { assignLinearRole, templates, owner, input },
}) => {
  await assignLinearRole("admin");

  await expect(templates.pickRole(owner, { ...input, role: "admin" })).rejects.toBeInstanceOf(
    ApplicationError,
  );
});

test("only the owner can resolve Ivan's role conflict", async ({
  workspace: { assignLinearRole, templates, input },
}) => {
  await assignLinearRole("admin");
  await assignLinearRole(null);

  await expect(templates.pickRole(ADMIN, { ...input, role: "admin" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("asks again when a template stops granting the picked role and its replacement still conflicts", async ({
  workspace: { assignLinearRole, templates, owner, input },
  seed,
  orm,
}) => {
  const { id } = await assignLinearRole("admin");
  await assignLinearRole(null);
  await seed.employeeAppChoice({ ...input, choice: "role_picked", role: "admin" });

  const employeeHistory = async () =>
    (await storedRecordHistory(orm)).filter(
      (line) => line.recordType === "employee" && line.recordId === input.employeeId,
    );
  const before = await employeeHistory();

  await templates.setAppRole(owner, { id, appId: input.appId, role: "guest" });

  expect(await storedEmployeeAppChoices(orm)).toEqual([]);
  expect((await employeeHistory()).slice(before.length)).toMatchObject([{ operation: "updated" }]);
  const [apps] = await templates.readEmployeeApps(owner, [input.employeeId]);
  expect(apps!.find(({ appId }) => appId === input.appId)).toMatchObject({ roleConflict: true });
});

test("sets a template role using an uppercase app ID", async ({
  workspace: { owner, templates, input, assignLinearRole },
}) => {
  const { id } = await assignLinearRole(null);
  const updated = await templates.setAppRole(owner, {
    id,
    appId: input.appId.toUpperCase(),
    role: "guest",
  });
  expect(updated.apps).toMatchObject([{ appId: input.appId, role: "guest" }]);
});

test("picks an explicit role using an uppercase app ID", async ({
  workspace: { owner, templates, input, assignLinearRole },
}) => {
  await assignLinearRole(null);
  await assignLinearRole("guest");
  await templates.pickRole(owner, { ...input, appId: input.appId.toUpperCase(), role: "guest" });
  const [apps] = await templates.readEmployeeApps(owner, [input.employeeId]);
  expect(apps!.find(({ appId }) => appId === input.appId)).toMatchObject({
    role: "guest",
    roleConflict: false,
  });
});

test("a role picked with an uppercase employee ID appears in that person's history", async ({
  workspace: { owner, templates, input, assignLinearRole },
  orm,
}) => {
  await assignLinearRole(null);
  await assignLinearRole("guest");
  await templates.pickRole(owner, {
    ...input,
    employeeId: input.employeeId.toUpperCase(),
    role: "guest",
  });
  const history = await recordHistory.read(orm, "employee", input.employeeId, { first: 1 });
  expect(history.edges[0]?.node).toMatchObject({
    author: { id: owner.user!.userId },
    changes: [{ field: "appChoice", newValue: input.appId, newLabel: "guest" }],
  });
});
