import {
  addPersonService,
  connectLinear,
  containerConnectors,
  employeeServices,
  expect,
  googleScanSetup,
  postFakeControl,
  scans,
  storedAppAccounts,
  SYSTEM,
  templateReviewTransactor,
  test,
} from "#test/support";
import type { Orm } from "../../../core/db";

test("a Linear scan that writes employee History keeps the person awaiting Google until a directory scan finds them", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { employeeId, google, linear, people } = await pendingLinearMember(
    orm,
    fakeGoogle.url,
    fakeConnectors.url,
  );
  await seed.employeeAppChoice({ employeeId, appId: linear.appId, choice: "to_review" });
  await postFakeControl(fakeConnectors.url, `linear/members/${EMAIL}/remove`);
  const scan = scans(orm, {
    connectors: containerConnectors(fakeConnectors.url),
    transact: templateReviewTransactor(orm),
  });
  await scan.scanNow(google.owner, linear.connectionId);

  await scan.runScan(SYSTEM, linear.sourceId);

  const { edges } = await employeeServices(orm).readEmployeeHistory(google.owner, employeeId, {});
  expect(edges[0]?.node).toMatchObject({
    cause: { kind: "FOUND_BY_SCAN", ref: linear.sourceId },
    changes: [{ field: "appChoice", oldValue: linear.appId, newValue: null }],
  });
  expect(await people.readDirectoryProvisions(google.owner, [employeeId])).toMatchObject([
    { status: null, canDelete: true },
  ]);
  await google.scans.runScan(SYSTEM, google.sourceId);
  expect(await people.readDirectoryProvisions(google.owner, [employeeId])).toEqual([null]);
});

test("a linked Linear account prevents deletion of a pending person until the link is gone", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { employeeId, google, linear, people } = await pendingLinearMember(
    orm,
    fakeGoogle.url,
    fakeConnectors.url,
  );

  await expect(people.deletePerson(google.owner, employeeId)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  const account = (await storedAppAccounts(orm)).find(
    ({ appId, email }) => appId === linear.appId && email === EMAIL,
  );
  expect(account).toMatchObject({ employeeId, employeeLinkedBy: "email" });
  await postFakeControl(fakeConnectors.url, `linear/members/${EMAIL}/remove`);
  await linear.scans.scanNow(google.owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  await people.deletePerson(google.owner, employeeId);
  expect(await employeeServices(orm).readEmployee(google.owner, employeeId)).toBeNull();
});

const EMAIL = "chloe@acme.example";

async function pendingLinearMember(orm: Orm, googleUrl: string, connectorsUrl: string) {
  const google = await googleScanSetup(orm, googleUrl);
  const linear = await connectLinear(orm, connectorsUrl);
  const people = addPersonService(orm);
  const { id: employeeId } = await people.addPerson(google.owner, {
    firstName: "Chloé",
    lastName: "Martin",
    email: EMAIL,
    templateIds: [],
  });
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const account = (await storedAppAccounts(orm)).find(
    ({ appId, email }) => appId === linear.appId && email === EMAIL,
  );
  expect(account).toMatchObject({ employeeId });
  return { employeeId, google, linear, people };
}
