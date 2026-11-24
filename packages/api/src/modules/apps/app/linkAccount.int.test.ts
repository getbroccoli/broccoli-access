import {
  accountChanges,
  accountLinks,
  ADMIN,
  apps,
  appUsers,
  employeeServices,
  EMPLOYEE,
  expect,
  expectBlockedBy,
  holdBeforeCommit,
  recordHistory,
  scannedLinear,
  storedAppAccounts,
  test,
} from "#test/support";

test("linking Ana's private Slack account shows both accounts and counts her once", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const ana = await seed.employee({ firstName: "Ana", lastName: "Ruiz", email: "ana@example.com" });
  const slack = await seed.app({ status: "approved" });
  const work = await seed.appAccount({ appId: slack.id, employeeId: ana.id, email: ana.email });
  const personal = await seed.appAccount({ appId: slack.id, email: "ana.ruiz@gmail.example" });
  const links = accountLinks(orm);

  const linked = await links.linkAccount(owner, { appAccountId: personal.id, employeeId: ana.id });

  expect(linked).toMatchObject({ id: personal.id, employeeId: ana.id });
  const accounts = await appUsers(orm).readUsersOfEmployees(owner, [ana.id]);
  expect(accounts.map(({ id }) => id).sort()).toEqual([work.id, personal.id].sort());
  expect(await apps(orm).readApp(owner, slack.id)).toMatchObject({ peopleCount: 1 });
  const [access] = await employeeServices(orm).readAccessOfEmployees(owner, [ana.id]);
  expect(access!.currentAccess.map(({ appName }) => appName)).toEqual(["Slack"]);
  expect((await links.listAccountsWithoutPerson(owner, {})).edges).toEqual([]);
  expect(await links.countAccountsWithoutPerson(owner)).toBe(0);
});

test("keeps the owner link when a Disable is being requested on the same account", async ({
  orm,
  seed,
  transact,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const person = await seed.employee();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const account = linear.account("chloe@acme.example");
  const held = holdBeforeCommit(transact);
  const changes = accountChanges(orm, {
    connectorsUrl: fakeConnectors.url,
    transact: held.transact,
  });
  const change = changes.changeAccount(owner, { appAccountId: account.id, action: "suspend" });
  const pid = await Promise.race([
    held.ready,
    change.then(() => {
      throw new Error("Disable was not held");
    }),
  ]);
  const linked = accountLinks(orm).linkAccount(owner, {
    appAccountId: account.id,
    employeeId: person.id,
  });
  const results = Promise.allSettled([change, linked]);
  try {
    await expectBlockedBy(orm, pid);
  } finally {
    held.release();
    await results;
  }
  expect(await change).toMatchObject({ appAccountId: account.id, status: "running" });
  expect(await linked).toMatchObject({ id: account.id, employeeId: person.id });
  expect((await storedAppAccounts(orm)).find(({ id }) => id === account.id)).toMatchObject({
    employeeId: person.id,
    employeeLinkedBy: "owner",
  });
});

test("records the canonical employee id in history when the owner links with an uppercase UUID", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const person = await seed.employee();
  const app = await seed.app({ status: "approved" });
  const account = await seed.appAccount({ appId: app.id });

  await accountLinks(orm).linkAccount(owner, {
    appAccountId: account.id,
    employeeId: person.id.toUpperCase(),
  });

  expect(await storedAppAccounts(orm)).toMatchObject([
    { id: account.id, employeeId: person.id, employeeLinkedBy: "owner" },
  ]);
  const { edges } = await recordHistory.read(orm, "app_account", account.id, {});
  expect(edges).toMatchObject([
    {
      node: {
        operation: "UPDATED",
        cause: { kind: "EDITED_DIRECTLY" },
        author: { kind: "SIGNED_IN_USER", id: owner.user!.userId },
      },
    },
  ]);
  expect(edges[0]!.node.changes).toContainEqual(
    expect.objectContaining({ field: "employee", oldValue: null, newValue: person.id }),
  );
});

test.for(["appAccountId", "employeeId"] as const)(
  "refuses an unknown %s",
  async (field, { orm, seed }) => {
    const owner = await seed.owner();
    const person = await seed.employee();
    const app = await seed.app({ status: "approved" });
    const account = await seed.appAccount({ appId: app.id });
    const input = {
      appAccountId: account.id,
      employeeId: person.id,
      [field]: "00000000-0000-4000-8000-000000000001",
    };

    await expect(accountLinks(orm).linkAccount(owner, input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  },
);

test("keeps the first link when an owner submits a stale account", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const original = await seed.employee();
  const other = await seed.employee();
  const app = await seed.app({ status: "approved" });
  const account = await seed.appAccount({
    appId: app.id,
    employeeId: original.id,
    employeeLinkedBy: "owner",
  });

  await expect(
    accountLinks(orm).linkAccount(owner, { appAccountId: account.id, employeeId: other.id }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await storedAppAccounts(orm)).toMatchObject([{ id: account.id, employeeId: original.id }]);
});

test.for([
  ["ignored", "personal"],
  ["approved", "service"],
  ["approved", "external"],
] as const)("refuses a stale account in state %s", async ([status, kind], { orm, seed }) => {
  const owner = await seed.owner();
  const person = await seed.employee();
  const app = await seed.app({ status });
  const account = await seed.appAccount({ appId: app.id, kind });

  await expect(
    accountLinks(orm).linkAccount(owner, { appAccountId: account.id, employeeId: person.id }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test.for([ADMIN, EMPLOYEE])("refuses a non-owner's link", async (ctx, { orm, seed }) => {
  const person = await seed.employee();
  const app = await seed.app({ status: "approved" });
  const account = await seed.appAccount({ appId: app.id });

  await expect(
    accountLinks(orm).linkAccount(ctx, { appAccountId: account.id, employeeId: person.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
