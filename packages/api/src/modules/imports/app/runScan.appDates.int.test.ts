import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  googleScanSetup,
  storedApps,
  storedAppAccounts,
  grantAtFakeGoogle,
} from "#test/support";

test("dates Gabriel's and Lena's Figma accounts from their grant events", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  const now = Date.now();

  await scans.runScan(SYSTEM, sourceId);

  const figma = (await storedApps(orm)).find(({ name }) => name === "Figma")!;
  const accounts = await storedAppAccounts(orm);
  for (const [email, days] of [
    ["gabriel@acme.example", 101],
    ["lena@acme.example", 76],
  ] as const) {
    const account = accounts.find(
      (account) => account.appId === figma.id && account.email === email,
    )!;
    expect(account.grantedBefore).toBeNull();
    expect(account.grantedAt).toBeInstanceOf(Date);
    expect(Math.abs(account.grantedAt!.getTime() - (now - days * DAY_MS))).toBeLessThan(60_000);
  }
});

test("dates Ana's unlogged Figma grant before the scan's 180-day log start", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  const startedAt = Date.now();

  await scans.runScan(SYSTEM, sourceId);

  const finishedAt = Date.now();
  const figma = (await storedApps(orm)).find(({ name }) => name === "Figma")!;
  const account = (await storedAppAccounts(orm)).find(
    ({ appId, email }) => appId === figma.id && email === "ana@acme.example",
  )!;
  expect(account.grantedAt).toBeNull();
  expect(account.grantedBefore).toBeInstanceOf(Date);
  expect(account.grantedBefore!.getTime()).toBeGreaterThanOrEqual(startedAt - 180 * DAY_MS);
  expect(account.grantedBefore!.getTime()).toBeLessThanOrEqual(finishedAt - 180 * DAY_MS);
});

test("dates every Claude account with the earliest grant 142 days before the scan", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  const now = Date.now();

  await scans.runScan(SYSTEM, sourceId);

  const claude = (await storedApps(orm)).find(({ name }) => name === "Claude")!;
  const accounts = (await storedAppAccounts(orm)).filter(({ appId }) => appId === claude.id);
  expect(accounts).toHaveLength(9);
  for (const account of accounts) {
    expect(account.grantedAt).toBeInstanceOf(Date);
    expect(account.grantedBefore).toBeNull();
  }
  const earliest = Math.min(...accounts.map(({ grantedAt }) => grantedAt!.getTime()));
  expect(Math.abs(earliest - (now - 142 * DAY_MS))).toBeLessThan(60_000);
});

test("keeps Ana's original grant bound when a later scan finds an authorize event", async ({
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
  expect(ana.grantedAt).toBeNull();
  expect(ana.grantedBefore).toBeInstanceOf(Date);
  await grantAtFakeGoogle(fakeGoogle.url, {
    email: ana.email,
    clientId: ACME.apps.find(({ name }) => name === "Figma")!.clientId,
    appName: "Figma",
    grantedAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
  });
  await transact((tx) =>
    scans.scanConnection(OWNER, tx, { connectionId, sourceName: "acme.example" }),
  );

  await scans.runScan(SYSTEM, sourceId);

  expect((await storedAppAccounts(orm)).find(({ id }) => id === ana.id)).toEqual(ana);
});

const DAY_MS = 86_400_000;
