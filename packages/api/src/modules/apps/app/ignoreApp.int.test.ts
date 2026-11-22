import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  apps,
  googleScanSetup,
  storedApps,
  storedRecordHistory,
} from "#test/support";

test.for(["discovered", "approved"] as const)(
  "ignores a %s app and records the caller's status change",
  async (status, { orm, seed }) => {
    const app = await seed.app({ status });

    const ignored = await apps(orm).ignoreApp(OWNER, app.id);

    expect(ignored).toMatchObject({ id: app.id, status: "ignored" });
    expect(await storedApps(orm)).toEqual([{ ...app, status: "ignored" }]);
    expect(await storedRecordHistory(orm)).toMatchObject([
      {
        recordType: "app",
        recordId: app.id,
        operation: "updated",
        authorKind: "signed_in_user",
        authorId: "test-owner",
        causeKind: "edited_directly",
        changes: [{ field: "status", oldValue: status, newValue: "ignored" }],
      },
    ]);
  },
);

test("ignoring an ignored app changes nothing and appends no history", async ({ orm, seed }) => {
  const app = await seed.app({ status: "ignored" });

  const ignored = await apps(orm).ignoreApp(OWNER, app.id);

  expect(ignored).toMatchObject({ id: app.id, status: "ignored" });
  expect(await storedApps(orm)).toEqual([app]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});

test("refuses to ignore a connected app and changes nothing", async ({ orm, fakeGoogle }) => {
  await googleScanSetup(orm, fakeGoogle.url);
  const before = { apps: await storedApps(orm), history: await storedRecordHistory(orm) };
  const google = before.apps.find(({ name }) => name === "Google Workspace")!;

  await expect(apps(orm).ignoreApp(OWNER, google.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "A connected app stays approved.",
  });

  expect({ apps: await storedApps(orm), history: await storedRecordHistory(orm) }).toEqual(before);
});

test("refuses to ignore an unknown app", async ({ orm }) => {
  await expect(apps(orm).ignoreApp(OWNER, randomUUID())).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("refuses to ignore an app with a malformed id", async ({ orm }) => {
  await expect(apps(orm).ignoreApp(OWNER, "not-an-id")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("refuses to ignore an app without MANAGE_WORKSPACE and changes nothing", async ({
  orm,
  seed,
}) => {
  const app = await seed.app();

  await expect(apps(orm).ignoreApp(EMPLOYEE, app.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await storedApps(orm)).toEqual([app]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});
