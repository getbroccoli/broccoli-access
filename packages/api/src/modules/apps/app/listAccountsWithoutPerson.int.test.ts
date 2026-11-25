import { sql } from "drizzle-orm";

import {
  accountLinks,
  ADMIN,
  connectLinear,
  EMPLOYEE,
  expect,
  OWNER,
  scannedLinear,
  serveAccountList,
  SYSTEM,
  test,
  type TestSeed,
} from "#test/support";

test("pages and counts only unlinked personal accounts in approved apps", async ({ orm, seed }) => {
  const approved = await seed.app({ status: "approved" });
  const ignored = await seed.app({ name: "Ignored", catalogKey: null, status: "ignored" });
  const discovered = await seed.app({ name: "Discovered", catalogKey: null, status: "discovered" });
  const person = await seed.employee();
  const one = await seed.appAccount({ appId: approved.id });
  const two = await seed.appAccount({ appId: approved.id });
  await seed.appAccount({ appId: ignored.id });
  await seed.appAccount({ appId: discovered.id });
  await seed.appAccount({ appId: approved.id, employeeId: person.id, email: person.email });
  await seed.appAccount({ appId: approved.id, kind: "service" });
  await seed.appAccount({ appId: approved.id, kind: "external" });
  const links = accountLinks(orm);

  const first = await links.listAccountsWithoutPerson(OWNER, { first: 1 });
  expect(first.edges).toHaveLength(1);
  expect(first.pageInfo.hasNextPage).toBe(true);
  const next = await links.listAccountsWithoutPerson(OWNER, {
    first: 1,
    after: first.edges[0]!.cursor,
  });
  expect(next.edges).toHaveLength(1);
  expect(next.pageInfo.hasNextPage).toBe(false);
  expect([first.edges[0]!.node.id, next.edges[0]!.node.id].sort()).toEqual([one.id, two.id].sort());
  expect(await links.countAccountsWithoutPerson(OWNER)).toBe(2);
});

test("stops offering a Google-only account when the first app scan finds no member", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const person = await seed.employee();
  const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
    response.json({ accounts: [], nextCursor: null });
  });
  const linear = await connectLinear(orm, server.url);
  const account = await seed.appAccount({ appId: linear.appId, foundVia: ["google_sign_in"] });
  const links = accountLinks(orm);
  expect((await links.listAccountsWithoutPerson(owner, {})).edges).toMatchObject([
    { node: { id: account.id } },
  ]);
  expect(await links.countAccountsWithoutPerson(owner)).toBe(1);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect.soft((await links.listAccountsWithoutPerson(owner, {})).edges).toEqual([]);
  expect.soft(await links.countAccountsWithoutPerson(owner)).toBe(0);
  await expect(
    links.linkAccount(owner, { appAccountId: account.id, employeeId: person.id }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    links.markAccount(owner, { appAccountId: account.id, kind: "external", note: "Agency" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("suggests only active directory employees from the scanned account's display name", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const directoryId = await seedDirectory(seed);
  const ana = await seed.employee({ firstName: "Ana", lastName: "Ruiz" });
  const hannah = await seed.employee({ firstName: "Hannah", lastName: "Weber" });
  await seed.employee({ firstName: "David", lastName: "Okafor" });
  await seed.appAccount({
    appId: directoryId,
    employeeId: ana.id,
    email: ana.email,
    foundVia: ["google_directory"],
  });
  await seed.appAccount({
    appId: directoryId,
    employeeId: hannah.id,
    email: hannah.email,
    status: "suspended",
    foundVia: ["google_directory"],
  });

  const { edges } = await accountLinks(orm).listAccountsWithoutPerson(OWNER, {});

  const nodeFor = (email: string) => edges.find(({ node }) => node.email === email)?.node;
  expect(nodeFor("ana@acme.example")).toMatchObject({
    id: linear.account("ana@acme.example").id,
    appId: linear.appId,
    displayName: "Ana Ruiz",
    suggestedEmployeeId: ana.id,
  });
  expect(nodeFor("hannah@acme.example")).toMatchObject({
    displayName: "Hannah Weber",
    suggestedEmployeeId: null,
  });
  expect(nodeFor("david@acme.example")).toMatchObject({
    displayName: "David Okafor",
    suggestedEmployeeId: null,
  });
});

test.for([1, 2])(
  "uses the email for a version %i record without a display name",
  async (version, { orm, seed, fakeConnectors }) => {
    const linear = await scannedLinear(orm, fakeConnectors.url);
    const directoryId = await seedDirectory(seed);
    const person = await seed.employee({ email: "gabriel@example.com" });
    await seed.appAccount({
      appId: directoryId,
      employeeId: person.id,
      email: person.email,
      foundVia: ["google_directory"],
    });
    const email = "gabriel@acme.example";
    const missingFields = version === 1 ? ["displayName", "isConnectionUser"] : ["displayName"];
    await orm.execute(sql`update import_records set type_version = ${version}, values = values - ${sql.param(missingFields)}::text[]
    where source_id = ${linear.sourceId} and values->>'email' = ${email}`);

    const { edges } = await accountLinks(orm).listAccountsWithoutPerson(OWNER, {});

    expect(edges.find(({ node }) => node.email === email)?.node).toMatchObject({
      displayName: null,
      suggestedEmployeeId: person.id,
    });
  },
);

test.for([ADMIN, EMPLOYEE])(
  "refuses to list or count accounts without a person for a non-owner",
  async (ctx, { orm }) => {
    const links = accountLinks(orm);
    await expect(links.listAccountsWithoutPerson(ctx, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(links.countAccountsWithoutPerson(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  },
);

async function seedDirectory(seed: TestSeed) {
  const directory = await seed.app({
    name: "Google Workspace",
    catalogKey: "google_workspace",
    status: "approved",
  });
  await seed.appConnection({ appId: directory.id, connector: "google_workspace" });
  return directory.id;
}
