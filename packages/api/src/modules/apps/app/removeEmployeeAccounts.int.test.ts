import { ACME_LINEAR, ACME_SLACK } from "@broccoli-access/fake-apps";
import { eq } from "drizzle-orm";

import {
  accountChanges,
  containerConnectors,
  EMPLOYEE,
  expect,
  failLinearCall,
  inviteTest,
  linearMemberStatus,
  listedLinearChloe,
  ownerHandOver,
  postFakeControl,
  scans,
  serveAccountList,
  serveManifest,
  storedAppConnections,
  storedImportSources,
  SYSTEM,
  writableGoogleConnection,
} from "#test/support";
import type { Orm } from "../../../core/db";
import { accountChanges as changesTable } from "../db";

const test = inviteTest.extend<{
  offboarded: { employeeId: string; email: string; slackAppId: string; slackConnectionId: string };
}>({
  offboarded: async ({ orm, fakeGoogle, fakeConnectors, workspace }, use) => {
    const { owner, service, employee, offboardingInput } = workspace;
    const { id: employeeId, email } = employee("chloe@acme.example");
    const slack = await ownerHandOver(orm, fakeConnectors, undefined, owner);
    const { connection } = await slack.service.connect(owner, {
      connector: "slack",
      appSession: slack.handOver.appSession,
      noticeAccepted: true,
    });
    const source = (await storedImportSources(orm)).find(
      (row) => row.connectionId === connection!.id,
    )!;
    await slack.scans.runScan(SYSTEM, source.id);
    const { appId } = (await storedAppConnections(orm)).find((row) => row.id === connection!.id)!;
    await writableGoogleConnection(orm, fakeGoogle.url, owner);
    await service.offboardEmployee(owner, await offboardingInput(employeeId));
    const disables = await orm.select().from(changesTable);
    expect(disables).toHaveLength(3);
    for (const change of disables) {
      await service.runChange(SYSTEM, change.id);
      expect(await service.readAccountChange(owner, change.id)).toMatchObject({
        status: "succeeded",
      });
    }
    await use({ employeeId, email, slackAppId: appId, slackConnectionId: connection!.id });
  },
});

test("lists the person's disabled app accounts by app name and leaves out the suspended directory account", async ({
  workspace: { service, owner, linear },
  offboarded: { employeeId, email, slackAppId },
}) => {
  const [plan] = await service.readOffboardings(owner, [employeeId]);

  expect(plan!.directoryAccount).toMatchObject({ email, status: "suspended" });
  expect(plan!.accountsToRemove).toMatchObject([
    { appId: linear.appId, email, status: "suspended" },
    { appId: slackAppId, email, status: "suspended" },
  ]);
});

test("leaves active accounts and accounts without a connection out of Remove", async ({
  workspace: { service, owner, employee, linear },
  seed,
}) => {
  const { id: employeeId, email } = employee("chloe@acme.example");
  const app = await seed.app({
    name: "Design",
    domain: "design.example",
    catalogKey: null,
    status: "approved",
  });
  await seed.appAccount({ employeeId, email, appId: app.id, status: "suspended" });

  const [plan] = await service.readOffboardings(owner, [employeeId]);

  expect(plan!.accountsToDisable).toContainEqual(
    expect.objectContaining({ id: linear.account(email).id }),
  );
  expect(plan!.accountsToRemove).toEqual([]);
});

test("leaves a suspended connection user out of Remove", async ({
  orm,
  workspace: { service, owner, employee, linear },
  fakeConnectors,
}) => {
  const member = listedLinearChloe("suspended");
  member.values.isConnectionUser = true;
  const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
    response.json({ accounts: [member], nextCursor: null });
  });
  const scan = scans(orm, { connectors: containerConnectors(server.url) });
  await scan.scanNow(owner, linear.connectionId);
  await scan.runScan(SYSTEM, linear.sourceId);
  const employeeId = employee(member.values.email).id;
  const accountId = linear.account(member.values.email).id;
  expect((await service.readChangeStates(owner, [accountId])).get(accountId)).toMatchObject({
    isConnectionUser: true,
  });

  const [plan] = await service.readOffboardings(owner, [employeeId]);
  expect(plan!.accountsToRemove).toEqual([]);
});

test("leaves a disabled account out when its connector does not offer Remove", async ({
  orm,
  workspace: { owner, employee },
  fakeConnectors,
}) => {
  const manifest = await serveManifest(fakeConnectors.url, ({ connectors }) => {
    const linear = connectors.find(({ key }) => key === "linear")!;
    linear.capabilities = linear.capabilities.filter((capability) => capability !== "remove");
  });
  const service = accountChanges(orm, { connectorsUrl: manifest.url });

  const [plan] = await service.readOffboardings(owner, [employee("hannah@acme.example").id]);
  expect(plan!.accountsToRemove).toEqual([]);
});

test("queues one Remove per selected app account in its own connection's group", async ({
  orm,
  workspace: { service, owner, linear, sent },
  offboarded: { employeeId, email, slackAppId, slackConnectionId },
}) => {
  const [before] = await service.readOffboardings(owner, [employeeId]);
  const jobCount = sent.length;

  const result = await service.removeEmployeeAccounts(owner, {
    employeeId,
    accountIds: before!.accountsToRemove.map(({ id }) => id),
  });

  const changes = await removeChanges(orm);
  expect(changes).toHaveLength(2);
  const jobs = sent.slice(jobCount);
  expect(jobs).toHaveLength(2);
  const shared = {
    email,
    status: "running",
    startedFrom: "account",
    employeeId: null,
    requestedBy: owner.user!.userId,
  };
  for (const { appId, connectionId, members } of [
    { appId: linear.appId, connectionId: linear.connectionId, members: ACME_LINEAR.members },
    { appId: slackAppId, connectionId: slackConnectionId, members: ACME_SLACK.members },
  ]) {
    const change = changes.find((row) => row.appId === appId)!;
    expect(change).toMatchObject({
      ...shared,
      connectionId,
      appAccountId: before!.accountsToRemove.find((account) => account.appId === appId)!.id,
      sourceKey: members.find((member) => member.email === email)!.sourceKey,
    });
    expect(jobs).toContainEqual({
      name: "apps.runAccountChange",
      payload: { changeId: change.id },
      options: { group: connectionId },
    });
  }
  expect(result.accountsToRemove).toEqual([]);
  expect(await service.readOffboardings(owner, [employeeId])).toEqual([result]);
});

test("selecting only the Linear account queues one Remove and leaves Slack available", async ({
  orm,
  workspace: { service, owner, linear },
  offboarded: { employeeId, email, slackAppId },
}) => {
  const accountId = linear.account(email).id;
  const result = await service.removeEmployeeAccounts(owner, {
    employeeId,
    accountIds: [accountId],
  });

  expect(await removeChanges(orm)).toMatchObject([{ appAccountId: accountId }]);
  expect(result.accountsToRemove).toMatchObject([{ appId: slackAppId, status: "suspended" }]);
});

test("selecting the suspended directory account queues nothing", async ({
  orm,
  workspace: { service, owner, sent },
  offboarded: { employeeId },
}) => {
  const [plan] = await service.readOffboardings(owner, [employeeId]);
  const jobCount = sent.length;

  await service.removeEmployeeAccounts(owner, {
    employeeId,
    accountIds: [plan!.directoryAccount!.id],
  });

  expect(await removeChanges(orm)).toEqual([]);
  expect(sent).toHaveLength(jobCount);
});

test("a stale selection leaves a replacement account in the same app available for Remove", async ({
  orm,
  fakeConnectors,
  workspace: { service, owner, employee, linear, sent },
}) => {
  const { id: employeeId, email } = employee("hannah@acme.example");
  const [preview] = await service.readOffboardings(owner, [employeeId]);
  const accountIds = preview!.accountsToRemove.map(({ id }) => id);
  expect(accountIds).toEqual([linear.account(email).id]);
  await postFakeControl(fakeConnectors.url, `linear/members/${email}/remove`);
  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  await postFakeControl(fakeConnectors.url, "linear/invitations", { email });
  await postFakeControl(fakeConnectors.url, `linear/invitations/${email}/accept`);
  await postFakeControl(fakeConnectors.url, `linear/members/${email}/suspend`);
  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);

  const result = await service.removeEmployeeAccounts(owner, { employeeId, accountIds });

  expect(await removeChanges(orm)).toEqual([]);
  expect(sent).toHaveLength(0);
  expect(result.accountsToRemove).toMatchObject([{ appId: linear.appId, email }]);
  expect(result.accountsToRemove[0]!.id).not.toBe(accountIds[0]);
});

test("asking again while Removes run keeps the same changes and jobs", async ({
  orm,
  workspace: { service, owner, sent },
  offboarded: { employeeId },
}) => {
  const [plan] = await service.readOffboardings(owner, [employeeId]);
  const input = { employeeId, accountIds: plan!.accountsToRemove.map(({ id }) => id) };
  await service.removeEmployeeAccounts(owner, input);
  const changes = await removeChanges(orm);
  expect(changes).toHaveLength(2);
  const jobs = [...sent];

  await service.removeEmployeeAccounts(owner, input);

  expect(await removeChanges(orm)).toEqual(changes);
  expect(sent).toEqual(jobs);
});

test("a refused Linear Remove stays on the account while Slack removes its member", async ({
  orm,
  fakeConnectors,
  workspace: { service, owner, linear },
  offboarded: { employeeId, email, slackAppId },
}) => {
  const [plan] = await service.readOffboardings(owner, [employeeId]);
  await service.removeEmployeeAccounts(owner, {
    employeeId,
    accountIds: plan!.accountsToRemove.map(({ id }) => id),
  });
  const changes = await removeChanges(orm);
  const linearRemove = changes.find((change) => change.appId === linear.appId)!;
  const slackRemove = changes.find((change) => change.appId === slackAppId)!;
  await failLinearCall(fakeConnectors.url, "actions/run", "not_allowed");

  await service.runChange(SYSTEM, linearRemove.id);
  await service.runChange(SYSTEM, slackRemove.id);

  const accountId = linear.account(email).id;
  const states = await service.readChangeStates(owner, [accountId]);
  expect(states.get(accountId)?.latestChange).toMatchObject({
    id: linearRemove.id,
    action: "remove",
    status: "failed",
    error: "not_allowed",
  });
  expect(await linearMemberStatus(fakeConnectors.url, email)).toBe("suspended");
  expect(await service.readAccountChange(owner, slackRemove.id)).toMatchObject({
    status: "succeeded",
  });
  const response = await fetch(`${fakeConnectors.url}/_fake/state`);
  const state = (await response.json()) as { slack: { email: string }[] };
  expect(state.slack.map((member) => member.email)).not.toContain(email);
});

test.for([
  ["without a signed-in user", SYSTEM],
  ["without workspace management", EMPLOYEE],
] as const)(
  "refuses Remove %s",
  async ([, caller], { workspace: { service, owner, sent }, offboarded: { employeeId }, orm }) => {
    const [plan] = await service.readOffboardings(owner, [employeeId]);
    const accountId = plan!.accountsToRemove[0]!.id;
    const jobs = [...sent];

    await expect(
      service.removeEmployeeAccounts(caller, { employeeId, accountIds: [accountId] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await removeChanges(orm)).toEqual([]);
    expect(sent).toEqual(jobs);
  },
);

test("refuses Remove for an unknown employee", async ({ workspace: { service, owner } }) => {
  await expect(
    service.removeEmployeeAccounts(owner, {
      employeeId: "00000000-0000-4000-8000-000000000001",
      accountIds: [],
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

function removeChanges(orm: Orm) {
  return orm
    .select()
    .from(changesTable)
    .where(eq(changesTable.action, "remove"))
    .orderBy(changesTable.id);
}
