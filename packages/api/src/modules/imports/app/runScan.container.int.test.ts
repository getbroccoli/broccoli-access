import { inspect } from "node:util";

import { ACME_LINEAR } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  apps,
  appUsers,
  scans,
  containerConnectors,
  serveAccountList,
  storedAppConnections,
  storedRecordHistory,
  TEST_SECRET_BOX,
  connectLinear,
  googleScanSetup,
  googleScanWithLinearGrant,
  failLinearCall,
  storedAppAccounts,
  storedEmployees,
  storedImportRecords,
  storedImportSources,
} from "#test/support";

test("links all seven Linear members to their employees with the status Linear reports", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const google = await googleScanSetup(orm, fakeGoogle.url);
  await google.scans.runScan(SYSTEM, google.sourceId);
  const linear = await connectLinear(orm, fakeConnectors.url);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  const members = (await storedAppAccounts(orm)).filter(
    (account) => account.appId === linear.appId,
  );
  const employees = await storedEmployees(orm);
  expect(members).toHaveLength(7);
  for (const person of ACME_LINEAR.members) {
    const employee = employees.find((employee) => employee.email === person.email)!;
    expect(members.find((member) => member.email === person.email)).toMatchObject({
      employeeId: employee.id,
      status: person.status,
      foundVia: ["linear_members"],
    });
  }
  expect(members.map((member) => member.email)).not.toContain("new.hire@acme.example");
});

test("stores version-two Linear records and identifies the admin who owns the key", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  const records = await storedImportRecords(orm);
  expect(records).toHaveLength(7);
  for (const member of ACME_LINEAR.members) {
    expect(records.find((record) => record.sourceKey === member.sourceKey)).toMatchObject({
      sourceId: linear.sourceId,
      type: "app_account",
      typeVersion: 2,
      values: {
        email: member.email,
        status: member.status,
        isConnectionUser: member.email === "admin@acme.example",
        appName: "Linear",
        appExternalId: null,
        firstName: null,
        lastName: null,
        managerEmail: null,
        grantedAt: null,
        grantedBefore: null,
      },
    });
  }
});

test("counts Ana's active Linear account as access for a suspended employee", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const google = await googleScanSetup(orm, fakeGoogle.url);
  await google.scans.runScan(SYSTEM, google.sourceId);
  const linear = await connectLinear(orm, fakeConnectors.url);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  const users = await appUsers(orm).readUsersOfApps(OWNER, [linear.appId]);
  expect(users.filter((user) => user.suspendedInDirectory)).toMatchObject([
    { email: "ana@acme.example" },
  ]);
  expect(await apps(orm).readApp(OWNER, linear.appId)).toMatchObject({
    suspendedWithAccessCount: 1,
  });
});

test("a Linear scan keeps the employee link on an account Google already found", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const email = "chloe@acme.example";
  await googleScanWithLinearGrant(orm, fakeGoogle.url, email);
  const linear = await connectLinear(orm, fakeConnectors.url);
  const before = (await storedAppAccounts(orm)).find(
    (account) => account.appId === linear.appId && account.email === email,
  )!;
  expect(before.employeeId).toEqual(expect.any(String));
  expect(before.foundVia).toEqual(["google_sign_in"]);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  const shared = (await storedAppAccounts(orm)).filter(
    (account) => account.appId === linear.appId && account.email === email,
  );
  expect(shared).toMatchObject([
    {
      id: before.id,
      employeeId: before.employeeId,
      foundVia: expect.arrayContaining(["linear_members", "google_sign_in"]) as unknown,
    },
  ]);
});

test("Google keeps the suspension that Linear read for Hannah", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const email = "hannah@acme.example";
  const google = await googleScanWithLinearGrant(orm, fakeGoogle.url, email);
  const linear = await connectLinear(orm, fakeConnectors.url);
  await linear.scans.runScan(SYSTEM, linear.sourceId);

  await google.scans.scanNow(OWNER, google.connectionId);
  await google.scans.runScan(SYSTEM, google.sourceId);

  expect(await google.scans.readScan(OWNER, google.connectionId)).toMatchObject({
    status: "scanned",
  });
  const hannah = (await storedAppAccounts(orm)).filter(
    (account) => account.appId === linear.appId && account.email === email,
  );
  expect(hannah).toMatchObject([
    {
      status: "suspended",
      foundVia: expect.arrayContaining(["google_sign_in", "linear_members"]) as unknown,
    },
  ]);
});

test("a third unavailable list answer fails the scan and preserves the last snapshot", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const records = await storedImportRecords(orm);
  const accounts = await storedAppAccounts(orm);
  expect(records).toHaveLength(7);
  expect(accounts).toHaveLength(7);
  await linear.scans.scanNow(OWNER, linear.connectionId);
  await failLinearCall(fakeConnectors.url, "accounts/list", "app_unavailable", 3);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "app_unavailable" },
  ]);
  expect(await storedImportRecords(orm)).toEqual(records);
  expect(await storedAppAccounts(orm)).toEqual(accounts);
});

test("the third attempt can finish a Linear scan", async ({ orm, fakeConnectors }) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await failLinearCall(fakeConnectors.url, "accounts/list", "app_unavailable", 2);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([{ status: "scanned", failure: null }]);
  expect(await storedImportRecords(orm)).toHaveLength(7);
});

test.for([
  {
    reason: "unknown error code",
    status: 200,
    body: { error: { code: "unrecognised" } },
    failure: "unexpected_response",
  },
  {
    reason: "non-200 list answer",
    status: 502,
    body: { error: { code: "permission_missing" } },
    failure: "app_unavailable",
  },
  {
    reason: "malformed list answer",
    status: 200,
    body: { accounts: null },
    failure: "unexpected_response",
  },
])(
  "records the scan failure for this response: $reason",
  async ({ status, body, failure }, { orm, fakeConnectors }) => {
    const linear = await connectLinear(orm, fakeConnectors.url);
    const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
      response.status(status).json(body);
    });
    const scan = scans(orm, { connectors: containerConnectors(server.url) });

    await scan.runScan(SYSTEM, linear.sourceId);

    expect(await storedImportSources(orm)).toMatchObject([{ status: "scan_failed", failure }]);
  },
);

test("a scan fails as unavailable when its connector is no longer listed", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  const scan = scans(orm, { connectors: containerConnectors() });

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "app_unavailable" },
  ]);
});

test("keeps the first page's updated connection when the next page fails", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const before = await storedImportRecords(orm);
  expect(before).toHaveLength(7);
  const settings = { organizationId: "renewed-organisation", urlKey: "renewed" };
  const secrets = { apiKey: "renewed-test-key" };
  const server = await serveAccountList(fakeConnectors.url, (request, response) => {
    if ((request.body as { cursor: string | null }).cursor === null) {
      response.json({ accounts: [], nextCursor: "second", connection: { settings, secrets } });
    } else {
      response.json({ error: { code: "unexpected_response" } });
    }
  });
  const scan = scans(orm, { connectors: containerConnectors(server.url) });
  await scan.scanNow(OWNER, linear.connectionId);

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "unexpected_response" },
  ]);
  expect(await storedImportRecords(orm)).toEqual(before);
  const [connection] = await storedAppConnections(orm);
  expect(connection!.settings).toEqual(settings);
  expect(
    JSON.parse(TEST_SECRET_BOX.decrypt(connection!.encryptedSecrets, linear.connectionId)),
  ).toEqual(secrets);
  const history = await storedRecordHistory(orm);
  const updates = history.filter(
    (line) => line.recordId === linear.connectionId && line.operation === "updated",
  );
  expect(updates).toMatchObject([
    { authorKind: "broccoli_itself", changes: [{ field: "settings" }] },
  ]);
  expect(inspect(history, { depth: null })).not.toContain(secrets.apiKey);
});

test("counts the seven returned Linear members and one suspension without matching employees", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await storedEmployees(orm)).toEqual([]);
  expect(await linear.scans.readScan(OWNER, linear.connectionId)).toMatchObject({
    status: "scanned",
    people: { count: 7, suspended: 1 },
  });
});
