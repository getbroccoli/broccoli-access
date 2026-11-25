import { ACME } from "@broccoli-access/fake-apps";

import {
  accountLinks,
  CREATION_START,
  expect,
  googleScanSetup,
  integrationUserTest,
  postFakeControl,
  scannedLinear,
  scans,
  storedApps,
  storedAppAccounts,
  storedAppConnections,
  storedEmployees,
  storedImportSources,
  SYSTEM,
  test,
} from "#test/support";

test("keeps the integration user's directory account without creating an employee, even after an email change", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const { scans, sourceId, ownerUserId } = await googleScanSetup(orm, fakeGoogle.url);
  const integrationUser = ACME.people.find(({ email }) => email === "chloe@acme.example")!;
  await seed.integrationUser({
    email: "david@acme.example",
    googleUserId: integrationUser.id,
    createdBy: ownerUserId,
  });

  await scans.runScan(SYSTEM, sourceId);

  const emails = (await storedEmployees(orm)).map((person) => person.email);
  expect(emails).toContain("david@acme.example");
  expect(emails.toSorted()).toEqual(
    ACME.people
      .map(({ email }) => email)
      .filter((email) => email !== "chloe@acme.example")
      .sort(),
  );
  const [connection] = await storedAppConnections(orm);
  const accounts = await storedAppAccounts(orm);
  expect(
    accounts.find(
      ({ email, appId }) => email === integrationUser.email && appId === connection!.appId,
    ),
  ).toMatchObject({ employeeId: null, foundVia: ["google_directory"] });
});

test("marks Google sign-ins and Linear members using the current email of the same Google user id", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  const google = await googleScanSetup(orm, fakeGoogle.url);
  const current = ACME.people.find(({ email }) => email === "chloe@acme.example")!;
  const previousEmail = "david@acme.example";
  await seed.integrationUser({
    email: previousEmail,
    googleUserId: current.id,
    createdBy: google.ownerUserId,
  });
  await google.scans.runScan(SYSTEM, google.sourceId);
  const linear = await scannedLinear(orm, fakeConnectors.url);

  const figma = (await storedApps(orm)).find(({ catalogKey }) => catalogKey === "figma")!;
  const accounts = (await storedAppAccounts(orm)).filter(({ appId }) => appId === figma.id);
  const service = { kind: "service", note: null, employeeId: null };
  const personal = { kind: "personal", employeeId: expect.any(String) as unknown };
  expect(accounts.find(({ email }) => email === current.email)).toMatchObject(service);
  expect(accounts.find(({ email }) => email === previousEmail)).toMatchObject(personal);
  expect(linear.account(current.email)).toMatchObject(service);
  expect(linear.account(previousEmail)).toMatchObject(personal);
});

integrationUserTest(
  "marks the integration user's own directory account as a service account, out of the accounts without a person",
  async ({ orm, workspace, fakeGoogle }) => {
    const { owner, users } = workspace;
    const { email } = CREATION_START;
    await users.finishCreation(owner, await workspace.allowCreation());
    const [googleSource] = await storedImportSources(orm);

    await scans(orm, { googleUrl: fakeGoogle.url }).runScan(SYSTEM, googleSource!.id);

    expect(
      (await storedAppAccounts(orm)).filter((account) => account.email === email),
    ).toMatchObject([
      { kind: "service", note: null, employeeId: null, foundVia: ["google_directory"] },
    ]);
    const waiting = await accountLinks(orm).listAccountsWithoutPerson(owner, {});
    expect(waiting.edges.map(({ node }) => node.email)).not.toContain(email);
  },
);

integrationUserTest(
  "shows the integration user's accepted Linear account with a read-only note",
  async ({ orm, workspace, fakeGoogle, fakeConnectors }) => {
    const { owner, users } = workspace;
    const { email } = CREATION_START;
    await users.finishCreation(owner, await workspace.allowCreation());
    const [googleSource] = await storedImportSources(orm);
    await scans(orm, { googleUrl: fakeGoogle.url }).runScan(SYSTEM, googleSource!.id);
    await postFakeControl(fakeConnectors.url, "linear/invitations", { email });
    await postFakeControl(fakeConnectors.url, `linear/invitations/${email}/accept`);

    const linear = await scannedLinear(orm, fakeConnectors.url);

    const account = linear.account(email);
    expect(account).toMatchObject({ kind: "service", note: null, employeeId: null });
    const links = accountLinks(orm);
    const marked = await links.listMarkedAccounts(owner, {});
    expect(marked.edges.find(({ node }) => node.id === account.id)?.node).toMatchObject({
      email,
      kind: "service",
      note: "Integration user",
      canEdit: false,
    });
    expect(
      (await links.listAccountsWithoutPerson(owner, {})).edges.map(({ node }) => node.id),
    ).not.toContain(account.id);
    await expect(
      links.editAccountNote(owner, { appAccountId: account.id, note: "My note" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  },
);
