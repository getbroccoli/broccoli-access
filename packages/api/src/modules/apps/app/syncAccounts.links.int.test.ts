import {
  connectLinear,
  expect,
  storedAppAccounts,
  SYSTEM,
  test,
  type TestSeed,
} from "#test/support";

import type { Transact } from "../../../core/db";
import type { FoundAccount } from "../domain";
import { createAppAccountService } from "./appAccountService";

test("keeps the owner's choice when no email matches and when a later scan matches someone else", async ({
  orm,
  seed,
  transact,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  const { person, account } = await ownerLinkedAccount(seed, linear.appId);
  const sync = syncLinear(transact, linear);

  const found = {
    appId: linear.appId,
    email: account.email,
    status: account.status,
    grantedAt: null,
    grantedBefore: null,
  };
  await sync([{ ...found, employeeId: null }]);
  expect(await storedAppAccounts(orm)).toMatchObject([
    { id: account.id, employeeId: person.id, employeeLinkedBy: "owner" },
  ]);

  const other = await seed.employee({ email: account.email });
  await sync([{ ...found, employeeId: other.id, status: "suspended" }]);
  expect(await storedAppAccounts(orm)).toMatchObject([
    { id: account.id, employeeId: person.id, employeeLinkedBy: "owner", status: "suspended" },
  ]);
});

test("deletes an owner-linked account when its last source stops finding it", async ({
  orm,
  seed,
  transact,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await ownerLinkedAccount(seed, linear.appId);

  await syncLinear(transact, linear)([]);

  expect(await storedAppAccounts(orm)).toEqual([]);
});

test.for(["service", "external"] as const)(
  "a scan keeps the owner's %s mark when an employee's email now matches",
  async (kind, { orm, seed, fakeConnectors }) => {
    const linear = await connectLinear(orm, fakeConnectors.url);
    const email = "deploys@acme.example";
    const marked = await seed.appAccount({
      appId: linear.appId,
      email,
      kind,
      note: "Release engineering",
      status: "suspended",
      foundVia: ["linear_members"],
    });
    await seed.employee({ email });

    await linear.scans.runScan(SYSTEM, linear.sourceId);

    const account = (await storedAppAccounts(orm)).find(({ id }) => id === marked.id);
    expect(account).toMatchObject({
      kind,
      note: marked.note,
      status: "active",
      employeeId: null,
      employeeLinkedBy: null,
    });
  },
);

async function ownerLinkedAccount(seed: TestSeed, appId: string) {
  const person = await seed.employee();
  const account = await seed.appAccount({
    appId,
    email: "private@example.com",
    employeeId: person.id,
    employeeLinkedBy: "owner",
    foundVia: ["linear_members"],
  });
  return { account, person };
}

function syncLinear(transact: Transact, linear: { connectionId: string; sourceId: string }) {
  const service = createAppAccountService();
  return (accounts: FoundAccount[]) =>
    transact((tx) =>
      service.syncAccounts(SYSTEM, tx, {
        accounts,
        connectionId: linear.connectionId,
        findingKind: "linear_members",
        cause: { kind: "FOUND_BY_SCAN", ref: linear.sourceId },
        readStartedAt: new Date("2026-11-24"),
      }),
    );
}
