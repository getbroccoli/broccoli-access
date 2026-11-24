import { onTestFinished } from "vitest";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  scans,
  connectLinear,
  containerConnectors,
  serveAccountList,
  startSimpleHttpServer,
  storedImportSources,
  storedImportRecords,
  storedAppAccounts,
} from "#test/support";

test("a redirected accounts list fails without reaching the other server", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  let requests = 0;
  const destination = await startSimpleHttpServer((_request, response) => {
    requests++;
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ accounts: [], nextCursor: null }));
  });
  onTestFinished(() => destination.stop());
  const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
    response.redirect(307, destination.url);
  });
  const scan = scans(orm, { connectors: containerConnectors(server.url) });

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(requests).toBe(0);
  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "app_unavailable" },
  ]);
});

test("a repeated cursor fails the scan and preserves its last snapshot", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const records = await storedImportRecords(orm);
  const accounts = await storedAppAccounts(orm);
  expect(records).toHaveLength(8);
  let requests = 0;
  const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
    // Bound a broken reader so the regression fails without leaving an endless scan.
    if (++requests > 2) {
      response.sendStatus(503);
      return;
    }
    response.json({ accounts: [], nextCursor: "same-page" });
  });
  const scan = scans(orm, { connectors: containerConnectors(server.url) });
  await scan.scanNow(OWNER, linear.connectionId);

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "unexpected_response" },
  ]);
  expect(requests).toBe(2);
  expect(await storedImportRecords(orm)).toEqual(records);
  expect(await storedAppAccounts(orm)).toEqual(accounts);
});

test("a member repeated on the next page fails the scan and keeps its last snapshot", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const records = await storedImportRecords(orm);
  const accounts = await storedAppAccounts(orm);
  expect(records).toHaveLength(8);
  const member = {
    sourceKey: "hannah",
    raw: {},
    values: {
      email: "hannah@acme.example",
      displayName: "Hannah",
      status: "active",
      isConnectionUser: false,
    },
  };
  const server = await serveAccountList(fakeConnectors.url, (request, response) => {
    const { cursor } = request.body as { cursor: string | null };
    response.json({ accounts: [member], nextCursor: cursor === null ? "second" : null });
  });
  const scan = scans(orm, { connectors: containerConnectors(server.url) });
  await scan.scanNow(OWNER, linear.connectionId);

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "unexpected_response" },
  ]);
  expect(await storedImportRecords(orm)).toEqual(records);
  expect(await storedAppAccounts(orm)).toEqual(accounts);
});
