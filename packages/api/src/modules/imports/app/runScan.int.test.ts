import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  googleScanSetup,
  scans as scanService,
  storedEmployees,
  storedAppAccounts,
  storedAppConnections,
  storedImportSources,
  storedImportRecords,
  storedRecordHistory,
  failFakeGoogle,
  suspendAtFakeGoogle,
  createGoogleWorkspaceConnector,
} from "#test/support";

import type { Connector, ConnectorErrorCode } from "../../../core/connectors";

test("saves all 42 directory people with lowercase emails and their names", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const people = await storedEmployees(orm);
  expect(people).toHaveLength(42);
  const records = await storedImportRecords(orm);
  expect(records).toHaveLength(42);
  for (const person of ACME.people) {
    expect(people.find(({ email }) => email === person.email.toLowerCase())).toMatchObject({
      firstName: person.givenName,
      lastName: person.familyName,
    });
    expect(records.find((record) => record.sourceKey === person.id)).toMatchObject({
      sourceId,
      type: "app_account",
      typeVersion: 1,
      raw: {
        id: person.id,
        primaryEmail: person.email,
        name: { givenName: person.givenName, familyName: person.familyName },
      },
      values: {
        email: person.email.toLowerCase(),
        firstName: person.givenName,
        lastName: person.familyName,
      },
    });
  }
});

test("links each manager even when the manager arrives on a later page", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const people = await storedEmployees(orm);
  for (const person of ACME.people) {
    const manager = people.find(({ email }) => email === person.managerEmail);
    expect(people.find(({ email }) => email === person.email)).toMatchObject({
      managerId: manager?.id ?? null,
    });
  }
  const david = people.find(({ email }) => email === "david@acme.example")!;
  expect(people.find(({ email }) => email === "ana@acme.example")?.managerId).toBe(david.id);
  expect(people.find(({ email }) => email === "admin@acme.example")?.managerId).toBeNull();
});

test("links the owner's user to their directory employee by email", async ({ orm, fakeGoogle }) => {
  const { scans, sourceId, ownerUserId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  expect(
    (await storedEmployees(orm)).find(({ email }) => email === "admin@acme.example"),
  ).toMatchObject({ firstName: "Mia", userId: ownerUserId });
});

test("writes the 42 Google Workspace accounts with their status and employee", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const [connection] = await storedAppConnections(orm);
  const people = await storedEmployees(orm);
  const accounts = await storedAppAccounts(orm);
  expect(accounts).toHaveLength(42);
  for (const person of ACME.people) {
    expect(accounts.find(({ email }) => email === person.email)).toMatchObject({
      appId: connection!.appId,
      employeeId: people.find(({ email }) => email === person.email)!.id,
      status: person.suspended ? "suspended" : "active",
      foundVia: ["google_directory"],
      firstSeenAt: expect.any(Date) as unknown,
      grantedAt: null,
      grantedBefore: null,
    });
  }
});

test("finishes scanned with the read time and counts of people and suspended accounts", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const [source] = await storedImportSources(orm);
  expect(source).toMatchObject({
    id: sourceId,
    status: "scanned",
    failure: null,
    readAt: expect.any(Date) as unknown,
  });
  expect(await scans.readScan(OWNER, connectionId)).toEqual({
    id: sourceId,
    status: "scanned",
    failure: null,
    readAt: source!.readAt,
    people: { state: "done", count: 42, suspended: 2 },
  });
});

test("a failed second page preserves the last successful records, people and accounts", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const before = {
    records: await storedImportRecords(orm),
    people: await storedEmployees(orm),
    accounts: await storedAppAccounts(orm),
    history: await storedRecordHistory(orm),
  };
  const [previousSource] = await storedImportSources(orm);
  // Aisha is on the first page: its changed data must not escape a failed scan.
  await suspendAtFakeGoogle(fakeGoogle.url, "aisha@acme.example");
  const failingScan = scanService(orm, {
    googleUrl: fakeGoogle.url,
    connectors: [failingFakeGoogleOnSecondPage(fakeGoogle.url, "permission_missing")],
  });
  await transact((tx) => failingScan.scanConnection(OWNER, tx, connectionId));

  await failingScan.runScan(SYSTEM, sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    {
      id: sourceId,
      status: "scan_failed",
      failure: "permission_missing",
      readAt: previousSource!.readAt,
    },
  ]);
  expect({
    records: await storedImportRecords(orm),
    people: await storedEmployees(orm),
    accounts: await storedAppAccounts(orm),
    history: await storedRecordHistory(orm),
  }).toEqual(before);
});

test("a rescan suspends Elif without duplicating people and appends just one history line", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const people = await storedEmployees(orm);
  const accounts = await storedAppAccounts(orm);
  const elif = accounts.find(({ email }) => email === "elif@acme.example")!;
  const history = await storedRecordHistory(orm);
  await suspendAtFakeGoogle(fakeGoogle.url, elif.email);
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  expect(await storedEmployees(orm)).toEqual(people);
  expect(await storedAppAccounts(orm)).toEqual(
    accounts.map((account) =>
      account.id === elif.id ? { ...account, status: "suspended" } : account,
    ),
  );
  const after = await storedRecordHistory(orm);
  expect(after.slice(0, history.length)).toEqual(history);
  expect(after.slice(history.length)).toMatchObject([
    {
      recordType: "app_account",
      recordId: elif.id,
      operation: "updated",
      authorKind: "broccoli_itself",
      causeKind: "found_by_scan",
      causeRef: sourceId,
      changes: [{ field: "status", oldValue: "active", newValue: "suspended" }],
    },
  ]);
});

test("retries a rate-limited page and finishes the scan", async ({ orm, fakeGoogle }) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.list",
    error: "rate_limited",
    count: 1,
  });

  await scans.runScan(SYSTEM, sourceId);

  expect(await storedImportSources(orm)).toMatchObject([{ status: "scanned", failure: null }]);
  expect(await storedImportRecords(orm)).toHaveLength(42);
});

test("three rate-limited attempts fail the scan without changing previous records", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const records = await storedImportRecords(orm);
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.list",
    error: "rate_limited",
    count: 3,
  });
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "rate_limited" },
  ]);
  expect(await storedImportRecords(orm)).toEqual(records);
});

test("records employee and account creations as found by this scan by Broccoli itself", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const history = await storedRecordHistory(orm);
  const people = await storedEmployees(orm);
  const accounts = await storedAppAccounts(orm);
  expect(people).toHaveLength(42);
  expect(accounts).toHaveLength(42);
  for (const [recordType, records] of [
    ["employee", people],
    ["app_account", accounts],
  ] as const) {
    expect(history.filter((line) => line.recordType === recordType)).toHaveLength(42);
    for (const record of records) {
      expect(
        history.find((line) => line.recordType === recordType && line.recordId === record.id),
      ).toMatchObject({
        operation: "created",
        authorKind: "broccoli_itself",
        authorId: null,
        causeKind: "found_by_scan",
        causeRef: sourceId,
      });
    }
  }
});

function failingFakeGoogleOnSecondPage(googleUrl: string, error: ConnectorErrorCode): Connector {
  const connector = createGoogleWorkspaceConnector({
    openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
    adminApiUrl: googleUrl,
  });
  return {
    ...connector,
    openSession: async (connection) => {
      const session = await connector.openSession(connection);
      let pagesRead = 0;
      return {
        testConnection: () => session.testConnection(),
        listAccounts: async (cursor) => {
          if (pagesRead === 1) {
            await failFakeGoogle(googleUrl, { endpoint: "directory.users.list", error, count: 1 });
          }
          const page = await session.listAccounts(cursor);
          pagesRead += 1;
          return page;
        },
      };
    },
  };
}
