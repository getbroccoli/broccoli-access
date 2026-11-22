import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  apps,
  storedApps,
  storedRecordHistory,
} from "#test/support";

test.for(["discovered", "ignored"] as const)(
  "approves a %s app and records the caller's status change",
  async (status, { orm, seed }) => {
    const app = await seed.app({ status });

    const approved = await apps(orm).approveApp(OWNER, app.id);

    expect(approved).toMatchObject({ id: app.id, status: "approved" });
    expect(await storedApps(orm)).toEqual([{ ...app, status: "approved" }]);
    expect(await storedRecordHistory(orm)).toMatchObject([
      {
        recordType: "app",
        recordId: app.id,
        operation: "updated",
        authorKind: "signed_in_user",
        authorId: "test-owner",
        causeKind: "edited_directly",
        changes: [{ field: "status", oldValue: status, newValue: "approved" }],
      },
    ]);
  },
);

test("approving an approved app changes nothing and appends no history", async ({ orm, seed }) => {
  const app = await seed.app({ status: "approved" });

  const approved = await apps(orm).approveApp(OWNER, app.id);

  expect(approved).toMatchObject({ id: app.id, status: "approved" });
  expect(await storedApps(orm)).toEqual([app]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});

test("refuses to approve an unknown app", async ({ orm }) => {
  await expect(apps(orm).approveApp(OWNER, randomUUID())).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("refuses to approve an app with a malformed id", async ({ orm }) => {
  await expect(apps(orm).approveApp(OWNER, "not-an-id")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("refuses to approve an app without MANAGE_WORKSPACE and changes nothing", async ({
  orm,
  seed,
}) => {
  const app = await seed.app();

  await expect(apps(orm).approveApp(EMPLOYEE, app.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await storedApps(orm)).toEqual([app]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});
