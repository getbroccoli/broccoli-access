import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  SYSTEM,
  googleScanSetup,
  storedAppAccounts,
  storedAppConnections,
  storedEmployees,
} from "#test/support";

test("keeps the integration user's directory account without creating an employee, even after an email change", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const { scans, sourceId, ownerUserId } = await googleScanSetup(orm, fakeGoogle.url);
  const integrationUser = ACME.people.find(({ email }) => email === "chloe@acme.example")!;
  await seed.integrationUser({
    email: "david@acme.example",
    googleUserId: integrationUser.id,
    createdBy: ownerUserId,
  });

  await scans.runScan(SYSTEM, sourceId);

  const emails = (await storedEmployees(orm)).map((person) => person.email);
  expect(emails).toContain("david@acme.example");
  expect(emails.toSorted()).toEqual(
    ACME.people
      .map(({ email }) => email)
      .filter((email) => email !== "chloe@acme.example")
      .sort(),
  );
  const [connection] = await storedAppConnections(orm);
  const accounts = await storedAppAccounts(orm);
  expect(
    accounts.find(
      ({ email, appId }) => email === integrationUser.email && appId === connection!.appId,
    ),
  ).toMatchObject({ employeeId: null, foundVia: ["google_directory"] });
});
