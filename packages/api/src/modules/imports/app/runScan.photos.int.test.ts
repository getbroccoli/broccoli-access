import { ACME } from "@broccoli-access/fake-apps";
import { onTestFinished } from "vitest";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  PNG,
  JPEG,
  googleScanSetup,
  scans as scanServices,
  createGoogleWorkspaceConnector,
  startCountingGoogleProxy,
  employeeServices,
  storedEmployees,
  storedFileIds,
  storedRecordHistory,
  storedImportSources,
  failFakeGoogle,
} from "#test/support";

test("stores a photo for each of the 11 named people and none for anyone else", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const people = await storedEmployees(orm);
  expect(people).toHaveLength(ACME.people.length);
  expect(people.filter(({ avatarFileId }) => avatarFileId !== null)).toHaveLength(11);
  for (const person of ACME.people) {
    const employee = people.find(({ email }) => email === person.email)!;
    if (person.photo === null) {
      expect(employee.avatarFileId, person.email).toBeNull();
    } else {
      expect(employee.avatarFileId, person.email).toEqual(expect.any(String));
      expect(await employeeServices(orm).readAvatar(OWNER, employee.avatarFileId!)).toEqual({
        content: person.photo,
        mimeType: "image/png",
      });
    }
  }
});

test("records a first photo on the employee's created history line", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const ana = (await storedEmployees(orm)).find(({ email }) => email === "ana@acme.example")!;
  expect(ana.avatarFileId).toEqual(expect.any(String));
  const history = (await storedRecordHistory(orm)).filter(
    ({ recordType, recordId }) => recordType === "employee" && recordId === ana.id,
  );
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    operation: "created",
    causeKind: "found_by_scan",
    causeRef: sourceId,
  });
  expect(history[0]!.changes).toContainEqual(
    expect.objectContaining({ field: "avatar", oldValue: null, newValue: ana.avatarFileId }),
  );
});

test("reads no photo on a scan where no photo changed", async ({ orm, fakeGoogle, transact }) => {
  const { sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  const proxy = await startCountingGoogleProxy(fakeGoogle.url);
  onTestFinished(() => proxy.stop());
  const scans = scanServices(orm, {
    googleUrl: fakeGoogle.url,
    connectors: [
      createGoogleWorkspaceConnector({
        openIdConfigurationUrl: `${fakeGoogle.url}/.well-known/openid-configuration`,
        adminApiUrl: proxy.url,
      }),
    ],
  });
  await scans.runScan(SYSTEM, sourceId);
  const before = await storedEmployees(orm);
  expect(before.filter(({ avatarFileId }) => avatarFileId !== null)).toHaveLength(11);
  expect(proxy.paths.filter((path) => path.endsWith("/photos/thumbnail"))).toHaveLength(11);
  proxy.paths.length = 0;
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  expect(proxy.paths.filter((path) => path.endsWith("/photos/thumbnail"))).toEqual([]);
  expect(
    (await storedEmployees(orm)).map(({ id, avatarFileId }) => ({ id, avatarFileId })),
  ).toEqual(before.map(({ id, avatarFileId }) => ({ id, avatarFileId })));
});

test("replaces a changed photo, deletes the old file and records the change", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const ana = (await storedEmployees(orm)).find(({ email }) => email === "ana@acme.example")!;
  expect(ana.avatarFileId).toEqual(expect.any(String));
  fakeGoogle.setPhoto(ana.email, PNG);
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  const updated = (await storedEmployees(orm)).find(({ id }) => id === ana.id)!;
  expect(updated.avatarFileId).toEqual(expect.any(String));
  expect(updated.avatarFileId).not.toBe(ana.avatarFileId);
  expect(await employeeServices(orm).readAvatar(OWNER, updated.avatarFileId!)).toEqual({
    content: PNG,
    mimeType: "image/png",
  });
  expect(await storedFileIds(orm)).not.toContain(ana.avatarFileId);
  const history = (await storedRecordHistory(orm)).filter(
    ({ recordType, recordId, operation }) =>
      recordType === "employee" && recordId === ana.id && operation === "updated",
  );
  expect(history).toMatchObject([
    {
      causeKind: "found_by_scan",
      causeRef: sourceId,
      changes: [{ field: "avatar", oldValue: ana.avatarFileId, newValue: updated.avatarFileId }],
    },
  ]);
});

test("clears a removed photo, deletes its file and records the change", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const ben = (await storedEmployees(orm)).find(({ email }) => email === "ben@acme.example")!;
  expect(ben.avatarFileId).toEqual(expect.any(String));
  fakeGoogle.setPhoto(ben.email, null);
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  const updated = (await storedEmployees(orm)).find(({ id }) => id === ben.id)!;
  expect(updated.avatarFileId).toBeNull();
  expect(await storedFileIds(orm)).not.toContain(ben.avatarFileId);
  const history = (await storedRecordHistory(orm)).filter(
    ({ recordType, recordId, operation }) =>
      recordType === "employee" && recordId === ben.id && operation === "updated",
  );
  expect(history).toMatchObject([
    {
      causeKind: "found_by_scan",
      causeRef: sourceId,
      changes: [{ field: "avatar", oldValue: ben.avatarFileId, newValue: null }],
    },
  ]);
});

test.for([
  { name: "an unexpected response", content: null },
  { name: "JPEG bytes declared as PNG", content: JPEG },
  { name: "SVG bytes", content: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
  {
    name: "a PNG larger than 256 KB",
    content: Buffer.concat([PNG, Buffer.alloc(262145 - PNG.length)]),
  },
])(
  "keeps the previous photo and finishes the scan after $name",
  async ({ content }, { orm, fakeGoogle, transact }) => {
    const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
    await scans.runScan(SYSTEM, sourceId);
    const chloe = (await storedEmployees(orm)).find(({ email }) => email === "chloe@acme.example")!;
    expect(chloe.avatarFileId).toEqual(expect.any(String));
    const photo = await employeeServices(orm).readAvatar(OWNER, chloe.avatarFileId!);
    fakeGoogle.setPhoto(chloe.email, content ?? PNG);
    if (content === null) {
      await failFakeGoogle(fakeGoogle.url, {
        endpoint: "directory.users.photos.get",
        error: "unexpected_response",
        count: 1,
      });
    }
    await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

    await scans.runScan(SYSTEM, sourceId);

    expect(await storedImportSources(orm)).toMatchObject([
      { id: sourceId, status: "scanned", failure: null },
    ]);
    expect((await storedEmployees(orm)).find(({ id }) => id === chloe.id)?.avatarFileId).toBe(
      chloe.avatarFileId,
    );
    expect(await employeeServices(orm).readAvatar(OWNER, chloe.avatarFileId!)).toEqual(photo);
  },
);

test("reads on the next scan a photo whose first read failed", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.photos.get",
    error: "unexpected_response",
    count: 1,
  });
  await scans.runScan(SYSTEM, sourceId);
  expect(await storedImportSources(orm)).toMatchObject([
    { id: sourceId, status: "scanned", failure: null },
  ]);
  expect(
    (await storedEmployees(orm)).filter(({ avatarFileId }) => avatarFileId !== null),
  ).toHaveLength(10);
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  expect(
    (await storedEmployees(orm)).filter(({ avatarFileId }) => avatarFileId !== null),
  ).toHaveLength(11);
});

test("reads again on the next scan a changed photo whose read failed", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const chloe = (await storedEmployees(orm)).find(({ email }) => email === "chloe@acme.example")!;
  fakeGoogle.setPhoto(chloe.email, PNG);
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.photos.get",
    error: "unexpected_response",
    count: 1,
  });
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));
  await scans.runScan(SYSTEM, sourceId);
  await transact((tx) => scans.scanConnection(OWNER, tx, connectionId));

  await scans.runScan(SYSTEM, sourceId);

  const updated = (await storedEmployees(orm)).find(({ id }) => id === chloe.id)!;
  expect(await employeeServices(orm).readAvatar(OWNER, updated.avatarFileId!)).toEqual({
    content: PNG,
    mimeType: "image/png",
  });
});
