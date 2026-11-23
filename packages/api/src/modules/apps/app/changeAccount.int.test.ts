import { ACME_LINEAR } from "@broccoli-access/fake-apps";
import { eq } from "drizzle-orm";

import {
  accountChanges,
  EMPLOYEE,
  expect,
  expectBlockedBy,
  googleScanWithLinearGrant,
  holdBeforeCommit,
  OWNER,
  recordingJobQueue,
  scannedLinear,
  SYSTEM,
  test,
} from "#test/support";

import type { AccountAction } from "../../../core/connectors";
import type { Orm } from "../../../core/db";
import { appConnections, accountChanges as changesTable } from "../db";

test("stores Chloé's running Disable with her Linear source key and queues it by connection", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const chloe = linear.account("chloe@acme.example");
  const { jobs, sent } = recordingJobQueue();
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url, jobs });

  const change = await service.changeAccount(owner, { appAccountId: chloe.id, action: "suspend" });

  expect(change).toEqual({
    id: expect.any(String) as unknown,
    appAccountId: chloe.id,
    appId: linear.appId,
    email: chloe.email,
    connectionId: linear.connectionId,
    action: "suspend",
    sourceKey: ACME_LINEAR.members.find(({ email }) => email === chloe.email)!.sourceKey,
    status: "running",
    attempts: [],
    error: null,
    requestedBy: owner.user!.userId,
    requestedAt: expect.any(Date) as unknown,
    finishedAt: null,
    changesAhead: 0,
  });
  const states = await service.readChangeStates(owner, [chloe.id]);
  expect(states.get(chloe.id)?.latestChange).toEqual(change);
  expect(sent).toEqual([
    {
      name: "apps.runAccountChange",
      payload: { changeId: change.id },
      options: { group: linear.connectionId },
    },
  ]);
});

test("returns one change ahead when another account is already queued on the connection", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const owner = await seed.owner();
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  await service.changeAccount(owner, {
    appAccountId: linear.account("chloe@acme.example").id,
    action: "suspend",
  });

  const second = await service.changeAccount(owner, {
    appAccountId: linear.account("ana@acme.example").id,
    action: "suspend",
  });

  expect(second).toMatchObject({ changesAhead: 1 });
});

test.for([
  { reason: "the member who owns the connection", email: "admin@acme.example", action: "suspend" },
  { reason: "Enable on an active account", email: "chloe@acme.example", action: "reactivate" },
] as const)(
  "refuses $reason without storing or queuing a change",
  async ({ email, action }, { orm, fakeConnectors }) => {
    const linear = await scannedLinear(orm, fakeConnectors.url);

    await expectRefusal(orm, fakeConnectors.url, linear.account(email).id, action);
  },
);

test("refuses an account found only by Google", async ({ orm, fakeGoogle, fakeConnectors }) => {
  const email = "elif@acme.example";
  await googleScanWithLinearGrant(orm, fakeGoogle.url, email);
  const linear = await scannedLinear(orm, fakeConnectors.url);

  await expectRefusal(orm, fakeConnectors.url, linear.account(email).id);
});

test("refuses another change while one is running", async ({ orm, seed, fakeConnectors }) => {
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const appAccountId = linear.account("chloe@acme.example").id;
  const { jobs, sent } = recordingJobQueue();
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url, jobs });
  const owner = await seed.owner();
  const input = { appAccountId, action: "suspend" } as const;
  const first = await service.changeAccount(owner, input);
  const firstJobs = [...sent];

  await expect(service.changeAccount(owner, input)).rejects.toMatchObject(NOT_OFFERED);

  expect(await storedChangeIds(orm)).toEqual([{ id: first.id }]);
  expect(sent).toEqual(firstJobs);
});

test("refuses a change while the connection needs reconnecting", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await scannedLinear(orm, fakeConnectors.url);
  await orm
    .update(appConnections)
    .set({ status: "reconnect", reconnectCause: "authentication_failed" })
    .where(eq(appConnections.id, linear.connectionId));

  await expectRefusal(orm, fakeConnectors.url, linear.account("chloe@acme.example").id);
});

test("refuses a change in an app without a connection", async ({ orm, seed, fakeConnectors }) => {
  const app = await seed.app({ status: "approved" });
  const account = await seed.appAccount({ appId: app.id });

  await expectRefusal(orm, fakeConnectors.url, account.id);
});

test("refuses an unknown account without storing or queuing a change", async ({
  orm,
  fakeConnectors,
}) => {
  await expectRefusal(orm, fakeConnectors.url, "00000000-0000-4000-8000-000000000001", "suspend", {
    code: "NOT_FOUND",
    message: "No app account has this id.",
  });
});

test("refuses an employee without storing or queuing a change", async ({ orm, fakeConnectors }) => {
  const linear = await scannedLinear(orm, fakeConnectors.url);
  await expectRefusal(
    orm,
    fakeConnectors.url,
    linear.account("chloe@acme.example").id,
    "suspend",
    { code: "FORBIDDEN", message: "Only admins can do this." },
    EMPLOYEE,
  );
});

test("two concurrent requests for one account store and queue only the first change", async ({
  orm,
  seed,
  transact,
  fakeConnectors,
}) => {
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const owner = await seed.owner();
  const held = holdBeforeCommit(transact);
  const { jobs, sent } = recordingJobQueue();
  const service = accountChanges(orm, {
    connectorsUrl: fakeConnectors.url,
    jobs,
    transact: held.transact,
  });
  const input = {
    appAccountId: linear.account("chloe@acme.example").id,
    action: "suspend",
  } as const;
  const first = service.changeAccount(owner, input);
  const pid = await Promise.race([
    held.ready,
    first.then(() => {
      throw new Error("First change was not held");
    }),
  ]);
  const results = Promise.allSettled([first, service.changeAccount(owner, input)]);
  try {
    await expectBlockedBy(orm, pid);
  } finally {
    held.release();
    await results;
  }

  expect(await results).toMatchObject([
    { status: "fulfilled" },
    { status: "rejected", reason: NOT_OFFERED },
  ]);
  expect(await storedChangeIds(orm)).toEqual([{ id: (await first).id }]);
  expect(sent).toHaveLength(1);
});

test("a second Disable waits for the first to finish and refuses the suspended account", async ({
  orm,
  seed,
  transact,
  fakeConnectors,
}) => {
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const owner = await seed.owner();
  const input = {
    appAccountId: linear.account("chloe@acme.example").id,
    action: "suspend",
  } as const;
  const connectorsUrl = fakeConnectors.url;
  const service = accountChanges(orm, { connectorsUrl });
  const change = await service.changeAccount(owner, input);
  const held = holdBeforeCommit(transact);
  const runner = accountChanges(orm, { connectorsUrl, transact: held.transact });
  const finishing = runner.runChange(SYSTEM, change.id);
  const pid = await held.ready;

  const results = Promise.allSettled([finishing, service.changeAccount(owner, input)]);
  try {
    await expectBlockedBy(orm, pid);
  } finally {
    held.release();
    await results;
  }

  expect(await results).toMatchObject([
    { status: "fulfilled" },
    { status: "rejected", reason: NOT_OFFERED },
  ]);
  expect(await storedChangeIds(orm)).toEqual([{ id: change.id }]);
});

const NOT_OFFERED = {
  code: "CONFLICT",
  message: "This change is not offered on this account now.",
};

async function storedChangeIds(orm: Orm) {
  return orm.select({ id: changesTable.id }).from(changesTable);
}

async function expectRefusal(
  orm: Orm,
  connectorsUrl: string,
  appAccountId: string,
  action: AccountAction = "suspend",
  error = NOT_OFFERED,
  ctx = OWNER,
) {
  const { jobs, sent } = recordingJobQueue();
  const service = accountChanges(orm, { connectorsUrl, jobs });

  await expect(service.changeAccount(ctx, { appAccountId, action })).rejects.toMatchObject(error);

  expect(await storedChangeIds(orm)).toEqual([]);
  expect(sent).toEqual([]);
}
