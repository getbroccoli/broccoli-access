import { ACME, ACME_LINEAR } from "@broccoli-access/fake-apps";
import { eq } from "drizzle-orm";

import {
  accountChanges,
  apps,
  EMPLOYEE,
  expect,
  inviteTest as test,
  linearMemberStatus,
  postFakeControl,
  storedApps,
  storedEmployeeAppChoices,
  storedEmployeeTemplates,
  SYSTEM,
  templateReviewTransactor,
  templates,
} from "#test/support";
import { appAccounts, accountChanges as changesTable } from "../db";

test("queues the directory Disable first and each running change in its own connection's group", async ({
  workspace: { service, owner, employee, linear, google, sent },
  orm,
}) => {
  const { id: employeeId, email } = employee("chloe@acme.example");
  const linearAccountId = "00000000-0000-7000-8000-000000000001";
  await orm
    .update(appAccounts)
    .set({ id: linearAccountId })
    .where(eq(appAccounts.id, linear.account(email).id));
  const [before] = await service.readOffboardings(owner, [employeeId]);
  const directory = before!.directoryAccount!;
  expect(linearAccountId.localeCompare(directory.id)).toBeLessThan(0);
  expect(before).toMatchObject({
    offboardedAt: null,
    directoryAccount: { email, status: "active" },
    accountsToDisable: [{ id: directory.id }, { id: linearAccountId }],
  });

  const result = await service.offboardEmployee(owner, {
    employeeId,
    appIds: before!.accountsToDisable.map(({ appId }) => appId),
  });

  const changes = await orm.select().from(changesTable);
  expect(changes).toHaveLength(2);
  const shared = {
    startedFrom: "offboarding",
    employeeId,
    email,
    action: "suspend",
    status: "running",
    requestedBy: owner.user!.userId,
  };
  const ordered = [directory.id, linearAccountId].map((id) =>
    changes.find((change) => change.appAccountId === id)!,
  );
  expect(ordered).toMatchObject([
    {
      ...shared,
      appId: directory.appId,
      connectionId: google.connectionId,
      sourceKey: ACME.people.find((person) => person.email === email)!.id,
    },
    {
      ...shared,
      appId: linear.appId,
      connectionId: linear.connectionId,
      sourceKey: ACME_LINEAR.members.find((person) => person.email === email)!.sourceKey,
    },
  ]);
  expect(sent).toEqual(
    ordered.map((change) => ({
      name: "apps.runAccountChange",
      payload: { changeId: change.id },
      options: { group: change.connectionId },
    })),
  );
  expect(result).toMatchObject({
    employeeId,
    offboardedAt: new Date(Math.max(...changes.map((change) => change.requestedAt.getTime()))),
    accountsToDisable: [],
    byHandWork: before!.byHandWork,
  });
  expect(await service.readOffboardings(owner, [employeeId])).toEqual([result]);
});

test("leaves an unticked app active and queues only the directory change", async ({
  workspace: { service, owner, employee, linear, google },
  orm,
  fakeConnectors,
}) => {
  const { id: employeeId, email } = employee("chloe@acme.example");

  const [plan] = await service.readOffboardings(owner, [employeeId]);
  const result = await service.offboardEmployee(owner, {
    employeeId,
    appIds: plan!.accountsToDisable.map(({ appId }) => appId).filter((id) => id !== linear.appId),
  });

  expect(await orm.select().from(changesTable)).toMatchObject([
    { connectionId: google.connectionId },
  ]);
  expect(result.accountsToDisable).toMatchObject([{ id: linear.account(email).id }]);
  expect(await linearMemberStatus(fakeConnectors.url, email)).toBe("active");
});

test("keeps the unconnected app and the pending invitation as by-hand work", async ({
  workspace: { service, owner, ivan, linear, google },
  orm,
  fakeConnectors,
}) => {
  const notion = (await storedApps(orm)).find((app) => app.name === "Notion")!;
  await apps(orm).approveApp(owner, notion.id);
  await postFakeControl(fakeConnectors.url, "linear/invitations", { email: ivan.email });
  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const byHandWork = [
    { appId: notion.id, reason: "app_has_no_connection" },
    { appId: linear.appId, reason: "invitation_is_pending" },
  ];
  const [before] = await service.readOffboardings(owner, [ivan.id]);
  expect(before!.byHandWork).toEqual(byHandWork);

  const result = await service.offboardEmployee(owner, {
    employeeId: ivan.id,
    appIds: before!.accountsToDisable.map(({ appId }) => appId),
  });

  expect(result.byHandWork).toEqual(byHandWork);
  expect(await orm.select().from(changesTable)).toMatchObject([
    { connectionId: google.connectionId },
  ]);
});

test("lists a queued Linear Enable as by-hand work and leaves that change alone", async ({
  workspace: { service, owner, employee, linear },
  orm,
}) => {
  const hannah = employee("hannah@acme.example");
  const account = linear.account(hannah.email);
  const enable = await service.changeAccount(owner, {
    appAccountId: account.id,
    action: "reactivate",
  });

  const [plan] = await service.readOffboardings(owner, [hannah.id]);
  expect(plan!.byHandWork).toContainEqual({ appId: linear.appId, reason: "change_is_running" });
  await service.offboardEmployee(owner, {
    employeeId: hannah.id,
    appIds: plan!.accountsToDisable.map(({ appId }) => appId),
  });

  const changes = await orm.select().from(changesTable);
  expect(changes.filter(({ appId }) => appId === linear.appId)).toMatchObject([
    { id: enable.id, status: "running", action: "reactivate" },
  ]);
});

test("offboarding again leaves the running changes and their queued jobs alone", async ({
  workspace: { service, owner, employee, sent, offboardingInput },
  orm,
}) => {
  const input = await offboardingInput(employee("chloe@acme.example").id);
  const first = await service.offboardEmployee(owner, input);
  const ids = (await orm.select().from(changesTable)).map((change) => change.id).sort();
  const jobs = [...sent];
  expect(ids).toHaveLength(2);

  expect(await service.offboardEmployee(owner, input)).toEqual(first);
  expect((await orm.select().from(changesTable)).map((change) => change.id).sort()).toEqual(ids);
  expect(sent).toEqual(jobs);
});

test("takes off only the leaver's templates and app choices and clears their differences", async ({
  workspace: { owner, employee, linear, ivan, offboardingInput },
  seed,
  orm,
  fakeConnectors,
  fakeGoogle,
}) => {
  const chloe = employee("chloe@acme.example");
  const notion = (await storedApps(orm)).find((app) => app.name === "Notion")!;
  const template = await seed.template({ appIds: [linear.appId] });
  for (const { id: employeeId } of [chloe, ivan]) {
    await seed.employeeTemplate({
      employeeId,
      templateId: template.id,
      assignedBy: owner.user!.userId,
    });
    await seed.employeeAppChoice({ employeeId, appId: notion.id, choice: "removed" });
  }
  const assignments = (await storedEmployeeTemplates(orm)).filter(
    (row) => row.employeeId === chloe.id,
  );
  const choices = (await storedEmployeeAppChoices(orm)).filter(
    (row) => row.employeeId === chloe.id,
  );
  const access = templates(orm);
  expect((await access.readEmployeeApps(owner, [ivan.id]))[0]).toContainEqual(
    expect.objectContaining({ appId: linear.appId, state: "missing" }),
  );
  const service = accountChanges(orm, {
    googleUrl: fakeGoogle.url,
    connectorsUrl: fakeConnectors.url,
    transact: templateReviewTransactor(orm),
  });

  await service.offboardEmployee(owner, await offboardingInput(ivan.id));

  expect(await storedEmployeeTemplates(orm)).toEqual(assignments);
  expect(await storedEmployeeAppChoices(orm)).toEqual(choices);
  const [rows] = await access.readEmployeeApps(owner, [ivan.id]);
  expect(rows!.filter((row) => row.state === "extra" || row.state === "missing")).toEqual([]);
});

test.for(["00000000-0000-4000-8000-000000000001", "invalid-id"])(
  "refuses unknown employee %s",
  async (employeeId, { workspace: { service, owner } }) => {
    await expect(service.offboardEmployee(owner, { employeeId, appIds: [] })).rejects.toMatchObject(
      { code: "NOT_FOUND", message: "No employee has this id." },
    );
  },
);

test("refuses offboarding without a signed-in user", async ({ workspace: { service, ivan } }) => {
  await expect(
    service.offboardEmployee(SYSTEM, { employeeId: ivan.id, appIds: [] }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only a signed-in user can offboard a person.",
  });
});

test("requires workspace management to read or start offboarding", async ({
  workspace: { service, ivan },
}) => {
  await expect(service.readOffboardings(EMPLOYEE, [ivan.id])).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    service.offboardEmployee(EMPLOYEE, { employeeId: ivan.id, appIds: [] }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("Activity identifies every change started by the offboarding", async ({
  workspace: { service, owner, employee, linear, google, offboardingInput },
}) => {
  const employeeId = employee("chloe@acme.example").id;
  await service.offboardEmployee(owner, await offboardingInput(employeeId));

  const { edges } = await service.listAccountChanges(owner, {});
  expect(edges.map(({ node }) => node.connectionId).sort()).toEqual(
    [google.connectionId, linear.connectionId].sort(),
  );
  for (const { node } of edges)
    expect(node).toMatchObject({ employeeId, startedFrom: "offboarding" });
});
