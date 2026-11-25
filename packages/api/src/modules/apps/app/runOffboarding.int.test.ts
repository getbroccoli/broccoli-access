import { ACME, type RunningFakeConnectors } from "@broccoli-access/fake-apps";
import {
  expect,
  failFakeGoogle,
  failLinearCall,
  googleUserSuspended,
  inviteTest as test,
  ownerHandOver,
  storedAppAccounts,
  storedApps,
  storedAppConnections,
  storedImportSources,
  SYSTEM,
  writableGoogleConnection,
} from "#test/support";
import type { Orm } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { accountChanges as changesTable } from "../db";

test("running the changes suspends the employee in Google Workspace, Linear and Slack", async ({
  workspace: { service, owner, employee, offboardingInput },
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { id: employeeId, email } = employee("chloe@acme.example");
  const { secrets } = await writableGoogleConnection(orm, fakeGoogle.url, owner);
  await scanSlack(orm, fakeConnectors, owner);
  await service.offboardEmployee(owner, await offboardingInput(employeeId));
  const changes = await orm.select().from(changesTable);

  for (const change of changes) await service.runChange(SYSTEM, change.id);

  expect(
    await googleUserSuspended(
      fakeGoogle.url,
      secrets,
      ACME.people.find((person) => person.email === email)!.id,
    ),
  ).toBe(true);
  const state = await fetch(`${fakeConnectors.url}/_fake/state`);
  expect(await state.json()).toMatchObject({
    linear: expect.arrayContaining([
      expect.objectContaining({ email, status: "suspended" }),
    ]) as unknown,
    slack: expect.arrayContaining([
      expect.objectContaining({ email, status: "suspended" }),
    ]) as unknown,
  });
  const ids = changes.map((change) => change.appAccountId);
  expect(
    (await storedAppAccounts(orm)).filter((account) => ids.includes(account.id)),
  ).toMatchObject([{ status: "suspended" }, { status: "suspended" }, { status: "suspended" }]);
});

test("leaves Slack active when a scan offers Disable after the owner selected Google Workspace", async ({
  workspace: { service, owner, employee, linear },
  orm,
  fakeConnectors,
}) => {
  const { id: employeeId } = employee("chloe@acme.example");
  const [before] = await service.readOffboardings(owner, [employeeId]);
  const appIds = [before!.directoryAccount!.appId];
  expect(before!.accountsToDisable.map(({ appId }) => appId)).toEqual([...appIds, linear.appId]);
  await scanSlack(orm, fakeConnectors, owner);
  const slack = (await storedApps(orm)).find(({ name }) => name === "Slack")!;

  const result = await service.offboardEmployee(owner, { employeeId, appIds });

  expect(await orm.select().from(changesTable)).toMatchObject([{ appId: appIds[0] }]);
  expect(result.accountsToDisable.map(({ appId }) => appId)).toEqual([linear.appId, slack.id]);
});

test("a failed Linear Disable can be retried or marked done by hand while the directory Disable succeeds", async ({
  workspace: { service, owner, employee, linear, offboardingInput },
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { id: employeeId, email } = employee("chloe@acme.example");
  await writableGoogleConnection(orm, fakeGoogle.url, owner);
  const { directoryAccount } = await service.offboardEmployee(
    owner,
    await offboardingInput(employeeId),
  );
  const changes = await orm.select().from(changesTable);
  const member = linear.account(email);
  const failed = changes.find((change) => change.appAccountId === member.id)!;
  await failLinearCall(fakeConnectors.url, "actions/run", "not_allowed");

  await service.runChange(SYSTEM, failed.id);
  await service.runChange(
    SYSTEM,
    changes.find((change) => change.appAccountId === directoryAccount!.id)!.id,
  );

  const states = await service.readChangeStates(owner, [member.id, directoryAccount!.id]);
  expect(states.get(directoryAccount!.id)?.latestChange).toMatchObject({ status: "succeeded" });
  expect(states.get(member.id)).toMatchObject({
    offeredChange: "suspend",
    latestChange: { id: failed.id, status: "failed", error: "not_allowed" },
  });
  expect(await service.markChangeDoneByHand(owner, failed.id)).toMatchObject({
    id: failed.id,
    status: "done_by_hand",
  });
});

test("a directory Disable refused by Google leaves the directory connection connected", async ({
  workspace: { service, owner, ivan, google, offboardingInput },
  orm,
  fakeGoogle,
}) => {
  await writableGoogleConnection(orm, fakeGoogle.url, owner);
  await service.offboardEmployee(owner, await offboardingInput(ivan.id));
  const [change] = await orm.select().from(changesTable);
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.update",
    error: "permission_missing",
    count: 1,
  });

  await service.runChange(SYSTEM, change!.id);

  expect(await orm.select().from(changesTable)).toMatchObject([
    { status: "failed", error: "permission_missing" },
  ]);
  expect(
    (await storedAppConnections(orm)).find((row) => row.id === google.connectionId),
  ).toMatchObject({ status: "connected" });
});

async function scanSlack(orm: Orm, fake: RunningFakeConnectors, owner: SecurityContext) {
  const { service, handOver, scans } = await ownerHandOver(orm, fake, undefined, owner);
  const slack = await service.connect(owner, {
    connector: "slack",
    appSession: handOver.appSession,
    noticeAccepted: true,
  });
  const source = (await storedImportSources(orm)).find(
    (row) => row.connectionId === slack.connection!.id,
  )!;
  await scans.runScan(SYSTEM, source.id);
}
