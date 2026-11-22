import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  googleScanSetup,
  storedApps,
  storedAppAccounts,
  storedEmployees,
  storedImportRecords,
  storedRecordHistory,
  storedImportSources,
  grantAtFakeGoogle,
  revokeAtFakeGoogle,
  failFakeGoogle,
} from "#test/support";

test("saves the 37 granted apps as discovered beside the approved Google Workspace", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const apps = await storedApps(orm);
  const accounts = await storedAppAccounts(orm);
  expect(apps).toHaveLength(38);
  expect(apps.find(({ name }) => name === "Google Workspace")).toMatchObject({
    status: "approved",
  });
  for (const app of ACME.apps) {
    const stored = apps.find(({ name }) => name === app.name)!;
    expect(stored).toMatchObject({ status: "discovered", externalIds: [`google:${app.clientId}`] });
    expect(accounts.filter(({ appId }) => appId === stored.id)).toHaveLength(
      ACME.grants.filter(({ clientId }) => clientId === app.clientId).length,
    );
  }
  expect(apps.flatMap(({ externalIds }) => externalIds)).not.toContain(
    `google:${ACME.oauthClient.clientId}`,
  );
  expect(
    Object.fromEntries(
      apps.map(({ id, name }) => [name, accounts.filter(({ appId }) => appId === id).length]),
    ),
  ).toMatchObject({
    Slack: 41,
    Notion: 31,
    Figma: 16,
    Miro: 12,
    Loom: 11,
    Claude: 9,
    ChatGPT: 7,
    Canva: 5,
    Calendly: 4,
    Zoom: 4,
    Typeform: 3,
    Grammarly: 2,
  });
});

test("changes no app, account or history line on a second scan", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const apps = await storedApps(orm);
  const accounts = await storedAppAccounts(orm);
  const history = await storedRecordHistory(orm);
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  expect(await storedApps(orm)).toEqual(apps);
  expect(await storedAppAccounts(orm)).toEqual(accounts);
  expect(await storedRecordHistory(orm)).toEqual(history);
});

test("links Ana's three active grant accounts and her directory account to her employee", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const apps = await storedApps(orm);
  const ana = (await storedEmployees(orm)).find(({ email }) => email === "ana@acme.example")!;
  const accounts = (await storedAppAccounts(orm)).filter(({ email }) => email === ana.email);
  expect(accounts).toHaveLength(4);
  for (const name of ["Figma", "Notion", "Slack"]) {
    expect(
      accounts.find(({ appId }) => appId === apps.find((app) => app.name === name)!.id),
    ).toMatchObject({
      employeeId: ana.id,
      status: "active",
      foundVia: ["google_sign_in"],
    });
  }
  expect(
    accounts.find(
      ({ appId }) => appId === apps.find(({ name }) => name === "Google Workspace")!.id,
    ),
  ).toMatchObject({
    employeeId: ana.id,
    status: "suspended",
    foundVia: ["google_directory"],
  });
});

test("uses the catalog for Figma and keeps Asana without a catalog or domain", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const apps = await storedApps(orm);
  expect(apps.find(({ name }) => name === "Figma")).toMatchObject({
    catalogKey: "figma",
    domain: "figma.com",
    externalIds: [`google:${FIGMA.clientId}`],
  });
  expect(apps.find(({ name }) => name === "Asana")).toMatchObject({
    catalogKey: null,
    domain: null,
    externalIds: [`google:${ACME.apps.find(({ name }) => name === "Asana")!.clientId}`],
  });
});

test("adds another client named figma to the existing app and Ana's existing account", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const figma = (await storedApps(orm)).find(({ name }) => name === "Figma")!;
  const ana = (await storedAppAccounts(orm)).find(
    ({ appId, email }) => appId === figma.id && email === "ana@acme.example",
  )!;
  const clientId = "999-figma-desktop.apps.googleusercontent.com";
  await grantAtFakeGoogle(fakeGoogle.url, { email: ana.email, clientId, appName: "figma" });
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  const apps = await storedApps(orm);
  expect(apps).toHaveLength(38);
  expect(apps.find(({ id }) => id === figma.id)).toMatchObject({
    externalIds: [`google:${FIGMA.clientId}`, `google:${clientId}`],
  });
  expect(
    (await storedAppAccounts(orm)).filter(
      ({ appId, email }) => appId === figma.id && email === ana.email,
    ),
  ).toEqual([ana]);
});

test("discovers an unknown app and dates its new grant", async ({ orm, fakeGoogle, transact }) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const grantedAfter = Date.now();
  await grantAtFakeGoogle(fakeGoogle.url, {
    email: "ana@acme.example",
    clientId: "new-app",
    appName: "Acme Sketch",
  });
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  const apps = await storedApps(orm);
  expect(apps).toHaveLength(39);
  const app = apps.find(({ name }) => name === "Acme Sketch")!;
  expect(app).toMatchObject({
    status: "discovered",
    domain: null,
    catalogKey: null,
    externalIds: ["google:new-app"],
  });
  const account = (await storedAppAccounts(orm)).find(({ appId }) => appId === app.id)!;
  const ana = (await storedEmployees(orm)).find(({ email }) => email === "ana@acme.example")!;
  expect(account).toMatchObject({
    email: ana.email,
    employeeId: ana.id,
    status: "active",
    foundVia: ["google_sign_in"],
    grantedBefore: null,
  });
  expect(account.grantedAt!.getTime()).toBeGreaterThanOrEqual(grantedAfter);
  expect(account.grantedAt!.getTime()).toBeLessThanOrEqual(Date.now());
});

test("deletes a revoked grant account while keeping its creation and deletion history", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const figma = (await storedApps(orm)).find(({ name }) => name === "Figma")!;
  const ana = (await storedAppAccounts(orm)).find(
    ({ appId, email }) => appId === figma.id && email === "ana@acme.example",
  )!;
  const history = (await storedRecordHistory(orm)).filter(({ recordId }) => recordId === ana.id);
  expect(history).toMatchObject([{ operation: "created" }]);
  await revokeAtFakeGoogle(fakeGoogle.url, { email: ana.email, clientId: FIGMA.clientId });
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  expect(
    (await storedAppAccounts(orm)).filter(
      ({ appId, email }) => appId === figma.id && email === ana.email,
    ),
  ).toEqual([]);
  const after = (await storedRecordHistory(orm)).filter(({ recordId }) => recordId === ana.id);
  expect(after).toHaveLength(2);
  expect(after[0]).toEqual(history[0]);
  expect(after[1]).toMatchObject({
    recordType: "app_account",
    operation: "deleted",
    authorKind: "broccoli_itself",
    causeKind: "found_by_scan",
    causeRef: sourceId,
  });
});

test.for(["directory.tokens.list", "reports.activities.list"])(
  "preserves apps, accounts, records and history after a failed %s rescan",
  async (endpoint, { orm, fakeGoogle, transact }) => {
    const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
    await scans.runScan(SYSTEM, sourceId);
    const before = {
      apps: await storedApps(orm),
      accounts: await storedAppAccounts(orm),
      records: await storedImportRecords(orm),
      history: await storedRecordHistory(orm),
    };
    await grantAtFakeGoogle(fakeGoogle.url, {
      email: "ana@acme.example",
      clientId: "new-app",
      appName: "Acme Sketch",
    });
    await failFakeGoogle(fakeGoogle.url, { endpoint, error: "permission_missing", count: 1 });
    await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

    await scans.runScan(SYSTEM, sourceId);

    expect(await storedImportSources(orm)).toMatchObject([
      { id: sourceId, status: "scan_failed", failure: "permission_missing" },
    ]);
    expect({
      apps: await storedApps(orm),
      accounts: await storedAppAccounts(orm),
      records: await storedImportRecords(orm),
      history: await storedRecordHistory(orm),
    }).toEqual(before);
  },
);

test("records every discovered app and grant account as created by the scan", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const apps = (await storedApps(orm)).filter(({ status }) => status === "discovered");
  const accounts = (await storedAppAccounts(orm)).filter(({ foundVia }) =>
    foundVia.includes("google_sign_in"),
  );
  const history = await storedRecordHistory(orm);
  expect(apps).toHaveLength(37);
  expect(accounts).toHaveLength(ACME.grants.length);
  for (const [recordType, records] of [
    ["app", apps],
    ["app_account", accounts],
  ] as const) {
    for (const record of records) {
      expect(
        history.filter((line) => line.recordType === recordType && line.recordId === record.id),
      ).toMatchObject([
        {
          operation: "created",
          authorKind: "broccoli_itself",
          authorId: null,
          causeKind: "found_by_scan",
          causeRef: sourceId,
        },
      ]);
    }
  }
});

const FIGMA = ACME.apps.find(({ name }) => name === "Figma")!;
