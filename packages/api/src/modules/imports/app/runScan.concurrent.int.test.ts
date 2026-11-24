import { sql } from "drizzle-orm";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  accountChanges,
  appConnectionRepository,
  apps,
  canReferenceEmployee,
  connectLinear,
  containerConnections,
  containerConnectors,
  expectBlockedBy,
  googleScanSetup,
  grantAtFakeGoogle,
  holdBeforeCommit,
  LINEAR_INPUT,
  pendingDisableTest,
  scans,
  serveAccountList,
  storedAppAccounts,
  storedApps,
  storedImportSources,
} from "#test/support";
import { ormOf } from "../../../core/db";

pendingDisableTest(
  "a scan waiting for its connection leaves a running change free to fail",
  async ({ pending: { linear, owner, change, latest }, orm, transact, fakeConnectors }) => {
    const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
      response.json({
        accounts: [],
        nextCursor: null,
        invitations: [{ email: "ivan@acme.example", invitedAt: null, expiresAt: null }],
      });
    });
    const scan = scans(orm, { connectors: containerConnectors(server.url) });
    await scan.scanNow(owner, linear.connectionId);
    const held = holdBeforeCommit(transact);
    const holding = held.transact((tx) =>
      appConnectionRepository(tx).lockById(linear.connectionId),
    );
    const pid = await held.ready;
    const saving = scan.runScan(SYSTEM, linear.sourceId);
    try {
      await expectBlockedBy(orm, pid);
      const service = accountChanges(orm, {
        transact: (work, options) =>
          transact(async (tx) => {
            await ormOf(tx).execute(sql`set local lock_timeout = '2s'`);
            return work(tx);
          }, options),
      });
      await service.failChange(SYSTEM, change.id);
      expect(await latest()).toMatchObject({ status: "failed" });
    } finally {
      held.release();
      await Promise.all([holding, saving]);
    }
    expect(await scan.readScan(owner, linear.connectionId)).toMatchObject({ status: "scanned" });
  },
);

test("a Google scan waiting for Linear leaves the employee available to account inserts", async ({
  orm,
  transact,
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  const google = await googleScanSetup(orm, fakeGoogle.url);
  const linear = await connectLinear(orm, fakeConnectors.url);
  const hannah = await seed.employee({ email: "hannah@acme.example" });
  await seed.appAccount({
    appId: linear.appId,
    email: hannah.email,
    employeeId: hannah.id,
    status: "active",
    foundVia: ["linear_members"],
  });
  const held = holdBeforeCommit(transact);
  const scan = scans(orm, {
    connectors: containerConnectors(fakeConnectors.url),
    transact: held.transact,
  });
  const saving = scan.runScan(SYSTEM, linear.sourceId);
  const pid = await held.ready;

  const directory = google.scans.runScan(SYSTEM, google.sourceId);
  try {
    await expectBlockedBy(orm, pid);
    expect(await canReferenceEmployee(orm, hannah.id)).toBe(true);
  } finally {
    held.release();
    await Promise.all([saving, directory]);
  }

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scanned" },
    { status: "scanned" },
  ]);
  expect(
    (await storedAppAccounts(orm)).find(
      (account) => account.appId === linear.appId && account.email === hannah.email,
    ),
  ).toMatchObject({
    employeeId: hannah.id,
    status: "suspended",
  });
});

test("connecting Linear waits for a Google scan to save the discovered app and approves that app", async ({
  orm,
  transact,
  fakeGoogle,
  fakeConnectors,
}) => {
  await grantAtFakeGoogle(fakeGoogle.url, {
    email: "hannah@acme.example",
    clientId: "linear-client",
    appName: "Linear",
  });
  const google = await googleScanSetup(orm, fakeGoogle.url);
  const held = holdBeforeCommit(transact);
  const scan = scans(orm, { googleUrl: fakeGoogle.url, transact: held.transact });
  const saving = scan.runScan(SYSTEM, google.sourceId);
  const pid = await held.ready;

  const connecting = containerConnections(orm, fakeConnectors.url).service.connect(
    OWNER,
    LINEAR_INPUT,
  );
  try {
    await expectBlockedBy(orm, pid);
  } finally {
    held.release();
    await Promise.all([saving, connecting]);
  }

  expect(await google.scans.readScan(OWNER, google.connectionId)).toMatchObject({
    status: "scanned",
  });
  const linear = (await storedApps(orm)).filter((app) => app.name === "Linear");
  expect(linear).toMatchObject([
    { catalogKey: "linear", status: "approved", externalIds: ["google:linear-client"] },
  ]);
  expect(await apps(orm).readApp(OWNER, linear[0]!.id)).toMatchObject({ connected: true });
});
