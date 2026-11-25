import {
  accountLinks,
  ADMIN,
  EMPLOYEE,
  expect,
  recordHistory,
  storedAppAccounts,
  test,
} from "#test/support";

test("marking two accounts moves both from the count into the paged marked list", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const app = await seed.app({ status: "approved" });
  const bot = await seed.appAccount({ appId: app.id });
  const guest = await seed.appAccount({ appId: app.id });
  const personal = await seed.appAccount({ appId: app.id });
  const ignored = await seed.app({ status: "ignored", catalogKey: null, name: "Ignored" });
  await seed.appAccount({ appId: ignored.id, kind: "external", note: "Agency" });
  const links = accountLinks(orm);
  expect(await links.countAccountsWithoutPerson(owner)).toBe(3);

  const service = await links.markAccount(owner, {
    appAccountId: bot.id,
    kind: "service",
    note: "  Deploys  ",
  });
  const external = await links.markAccount(owner, {
    appAccountId: guest.id,
    kind: "external",
    note: "  Design agency  ",
  });

  expect(service).toMatchObject({
    id: bot.id,
    email: bot.email,
    app: { id: app.id },
    kind: "service",
    note: "Deploys",
    canEdit: true,
  });
  expect(external).toMatchObject({
    id: guest.id,
    email: guest.email,
    app: { id: app.id },
    kind: "external",
    note: "Design agency",
    canEdit: true,
  });
  expect(await links.countAccountsWithoutPerson(owner)).toBe(1);
  expect((await links.listAccountsWithoutPerson(owner, {})).edges).toMatchObject([
    { node: { id: personal.id } },
  ]);
  const first = await links.listMarkedAccounts(owner, { first: 1 });
  expect(first.edges).toHaveLength(1);
  expect(first.pageInfo.hasNextPage).toBe(true);
  const next = await links.listMarkedAccounts(owner, { first: 1, after: first.edges[0]!.cursor });
  expect(next.edges).toHaveLength(1);
  expect(next.pageInfo.hasNextPage).toBe(false);
  expect([first.edges[0]!.node, next.edges[0]!.node]).toEqual(
    expect.arrayContaining([service, external]),
  );
});

test("records the owner's mark and note edit in the account's history", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const app = await seed.app({ status: "approved" });
  const account = await seed.appAccount({ appId: app.id });
  const links = accountLinks(orm);
  const marked = await links.markAccount(owner, {
    appAccountId: account.id,
    kind: "external",
    note: "Design agency",
  });

  const edited = await links.editAccountNote(owner, {
    appAccountId: account.id,
    note: "  Contract ends in March  ",
  });

  expect(edited).toEqual({ ...marked, note: "Contract ends in March" });
  expect((await links.listMarkedAccounts(owner, {})).edges).toMatchObject([{ node: edited }]);
  const { edges } = await recordHistory.read(orm, "app_account", account.id, {});
  const directEdit = {
    operation: "UPDATED",
    author: { kind: "SIGNED_IN_USER", id: owner.user!.userId },
    cause: { kind: "EDITED_DIRECTLY" },
  };
  expect(edges).toMatchObject([
    {
      node: {
        ...directEdit,
        changes: [{ field: "note", oldValue: "Design agency", newValue: "Contract ends in March" }],
      },
    },
    {
      node: {
        ...directEdit,
        changes: expect.arrayContaining([
          { field: "kind", oldValue: "personal", newValue: "external" },
          { field: "note", oldValue: null, newValue: "Design agency" },
        ]) as unknown,
      },
    },
  ]);
});

test("rejects a blank note for both a new mark and an existing mark", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const app = await seed.app({ status: "approved" });
  const personal = await seed.appAccount({ appId: app.id });
  const marked = await seed.appAccount({ appId: app.id, kind: "service", note: "Deploys" });
  const links = accountLinks(orm);
  const invalid = { code: "INVALID_INPUT", fieldErrors: [{ field: "note" }] };

  await expect(
    links.markAccount(owner, { appAccountId: personal.id, kind: "external", note: " \t " }),
  ).rejects.toMatchObject(invalid);
  await expect(
    links.editAccountNote(owner, { appAccountId: marked.id, note: " \n " }),
  ).rejects.toMatchObject(invalid);

  expect(await storedAppAccounts(orm)).toMatchObject([personal, marked]);
});

test("refuses to mark or edit an unknown account", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const links = accountLinks(orm);
  const input = { appAccountId: "00000000-0000-4000-8000-000000000001", note: "Builds" };
  await expect(links.markAccount(owner, { ...input, kind: "service" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(links.editAccountNote(owner, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test.for(["linked", "marked", "ignored"] as const)(
  "refuses a stale mark on a %s account",
  async (state, { orm, seed }) => {
    const owner = await seed.owner();
    const app = await seed.app({ status: state === "ignored" ? "ignored" : "approved" });
    const account = await seed.appAccount({
      appId: app.id,
      employeeId: state === "linked" ? (await seed.employee()).id : null,
      kind: state === "marked" ? "external" : "personal",
      note: state === "marked" ? "Agency" : null,
    });

    await expect(
      accountLinks(orm).markAccount(owner, {
        appAccountId: account.id,
        kind: "service",
        note: "Builds",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await storedAppAccounts(orm)).toMatchObject([account]);
  },
);

test("refuses to edit the note of a personal account", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const app = await seed.app({ status: "approved" });
  const account = await seed.appAccount({ appId: app.id });

  await expect(
    accountLinks(orm).editAccountNote(owner, { appAccountId: account.id, note: "Builds" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await storedAppAccounts(orm)).toMatchObject([account]);
});

test.for([ADMIN, EMPLOYEE])(
  "refuses a non-owner access to account marks",
  async (ctx, { orm, seed }) => {
    const app = await seed.app({ status: "approved" });
    const personal = await seed.appAccount({ appId: app.id });
    const marked = await seed.appAccount({ appId: app.id, kind: "external", note: "Agency" });
    const links = accountLinks(orm);

    await expect(links.listMarkedAccounts(ctx, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      links.markAccount(ctx, { appAccountId: personal.id, kind: "service", note: "Builds" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      links.editAccountNote(ctx, { appAccountId: marked.id, note: "Builds" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  },
);
