import {
  expect,
  test,
  SYSTEM,
  connectLinear,
  googleScanSetup,
  storedAppAccounts,
  holdBeforeCommit,
  expectBlockedBy,
} from "#test/support";

import { createAppAccountService } from "./appAccountService";

test("a concurrent Google sync keeps the status just committed by Linear", async ({
  orm,
  seed,
  transact,
  fakeConnectors,
  fakeGoogle,
}) => {
  const google = await googleScanSetup(orm, fakeGoogle.url);
  const linear = await connectLinear(orm, fakeConnectors.url);
  const hannah = await seed.appAccount({
    appId: linear.appId,
    email: "hannah@acme.example",
    status: "active",
    foundVia: ["linear_members"],
  });
  const service = createAppAccountService();
  const held = holdBeforeCommit(transact);
  const linearSync = held.transact((tx) =>
    service.syncAccounts(SYSTEM, tx, {
      findingKind: "linear_members",
      connectionId: linear.connectionId,
      accounts: [{ ...hannah, status: "suspended" }],
      cause: { kind: "FOUND_BY_SCAN", ref: linear.sourceId },
    }),
  );
  const pid = await held.ready;
  const googleSync = transact((tx) =>
    service.syncAccounts(SYSTEM, tx, {
      findingKind: "google_sign_in",
      connectionId: google.connectionId,
      accounts: [hannah],
      cause: { kind: "FOUND_BY_SCAN", ref: google.sourceId },
    }),
  );
  try {
    await expectBlockedBy(orm, pid);
  } finally {
    held.release();
  }
  await Promise.all([linearSync, googleSync]);

  expect(await storedAppAccounts(orm)).toMatchObject([
    { id: hannah.id, status: "suspended", foundVia: ["linear_members", "google_sign_in"] },
  ]);
});
