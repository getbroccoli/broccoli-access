import {
  accountChanges,
  EMPLOYEE,
  expect,
  failedDisable,
  failLinearCall,
  holdBeforeCommit,
  inviteTest,
  linearMemberStatus,
  OWNER,
  pendingDisable,
  storedAppAccounts,
  storedRecordHistory,
  SYSTEM,
  test,
} from "#test/support";

import type { Orm } from "../../../core/db";
import { accountChanges as changesTable } from "../db";

test("marks Chloé's failed Disable done by hand and records her suspension under the owner's name", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, change, owner, chloe, latest } = await failedDisable(
    orm,
    seed,
    fakeConnectors.url,
  );
  const failed = await latest();
  expect(failed).toMatchObject({
    status: "failed",
    error: "unexpected_response",
    attempts: [{ runtime: "server", error: "unexpected_response" }],
    finishedAt: expect.any(Date) as unknown,
  });

  const done = await service.markChangeDoneByHand(owner, change.id);

  expect(done).toEqual({ ...failed, status: "done_by_hand" });
  expect(await latest()).toEqual(done);
  expect((await storedAppAccounts(orm)).find(({ id }) => id === chloe.id)?.status).toBe(
    "suspended",
  );
  const updates = (await storedRecordHistory(orm)).filter(
    (line) => line.recordId === chloe.id && line.operation === "updated",
  );
  expect(updates).toMatchObject([
    {
      recordType: "app_account",
      causeKind: "done_by_hand",
      causeRef: change.id,
      authorKind: "signed_in_user",
      authorId: owner.user!.userId,
      changes: [{ field: "status", oldValue: "active", newValue: "suspended" }],
    },
  ]);
  expect(await linearMemberStatus(fakeConnectors.url, chloe.email)).toBe("active");
});

inviteTest(
  "marks a failed invite done by hand while a failing run holds its connection",
  async ({ workspace, orm, transact, fakeConnectors, signal }) => {
    const { service, owner, input, employee } = workspace;
    const connectorsUrl = fakeConnectors.url;
    const ivan = await service.inviteEmployee(owner, input);
    await failLinearCall(connectorsUrl, "actions/run", "unexpected_response");
    await service.runChange(SYSTEM, ivan.latestInvite!.id);
    const lena = await service.inviteEmployee(owner, {
      employeeId: employee("lena@acme.example").id,
      appId: input.appId,
    });
    await failLinearCall(connectorsUrl, "actions/run", "authentication_failed");
    const held = holdBeforeCommit(transact);
    const runner = accountChanges(orm, { connectorsUrl, transact: held.transact });
    signal.addEventListener("abort", () => held.release(), { once: true });
    const run = runner.runChange(SYSTEM, lena.latestInvite!.id);
    try {
      await held.ready;
      const done = await service.markChangeDoneByHand(owner, ivan.latestInvite!.id);
      expect(done).toMatchObject({ id: ivan.latestInvite!.id, status: "done_by_hand" });
    } finally {
      held.release();
      await run;
    }
  },
);

test.for(["running", "succeeded", "done_by_hand"] as const)(
  "refuses to mark a %s change done by hand and preserves the account, change and history",
  async (status, { orm, seed, fakeConnectors }) => {
    const disable = status === "done_by_hand" ? failedDisable : pendingDisable;
    const { service, change, owner } = await disable(orm, seed, fakeConnectors.url);
    if (status === "succeeded") await service.runChange(SYSTEM, change.id);
    if (status === "done_by_hand") {
      await service.markChangeDoneByHand(owner, change.id);
    }
    const before = await storedState(orm);
    expect(before.changes).toMatchObject([{ status }]);

    await expect(service.markChangeDoneByHand(owner, change.id)).rejects.toMatchObject(CONFLICT);

    expect(await storedState(orm)).toEqual(before);
  },
);

test("refuses to mark the failed Disable done by hand after Try again", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, change, owner, chloe } = await failedDisable(orm, seed, fakeConnectors.url);
  await service.changeAccount(owner, { appAccountId: chloe.id, action: change.action });
  const before = await storedState(orm);

  await expect(service.markChangeDoneByHand(owner, change.id)).rejects.toMatchObject(CONFLICT);

  expect(await storedState(orm)).toEqual(before);
});

test.for([
  { kind: "unknown", id: "00000000-0000-4000-8000-000000000001" },
  { kind: "malformed", id: "no-such-change" },
])("returns NOT_FOUND when the change id is $kind", async ({ id }, { orm, fakeConnectors }) => {
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  await expect(service.markChangeDoneByHand(OWNER, id)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No account change has this id.",
  });
});

test("refuses an employee and preserves the failed change, account and history", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, change } = await failedDisable(orm, seed, fakeConnectors.url);
  const before = await storedState(orm);

  await expect(service.markChangeDoneByHand(EMPLOYEE, change.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await storedState(orm)).toEqual(before);
});

const CONFLICT = {
  code: "CONFLICT",
  message: "Only an account's latest change, once it failed, can be marked as done by hand.",
};

async function storedState(orm: Orm) {
  return {
    changes: await orm.select().from(changesTable).orderBy(changesTable.id),
    accounts: await storedAppAccounts(orm),
    history: await storedRecordHistory(orm),
  };
}
