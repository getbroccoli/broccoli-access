import { expect, failLinearCall, inviteTest as test, SYSTEM } from "#test/support";
import { accountChanges } from "../db";

test("invites Ivan to his missing app with his template's role, started from Provision", async ({
  workspace: { assignLinearRole, ivan, linear, sent, provisionShown },
}) => {
  await assignLinearRole("admin");

  const changes = await provisionShown(ivan.id);

  expect(changes).toMatchObject([
    {
      action: "invite",
      appId: linear.appId,
      connectionId: linear.connectionId,
      email: ivan.email,
      role: "admin",
      startedFrom: "provision",
      employeeId: ivan.id,
      status: "running",
    },
  ]);
  expect(sent).toMatchObject([{ payload: { changeId: changes[0]!.id } }]);
});

test("enables Hannah's disabled account in her missing app, started from Provision", async ({
  workspace: { owner, employee, linear, provisionShown },
  seed,
}) => {
  const hannah = employee("hannah@acme.example");
  await seed.assignedTemplateApp({
    employeeId: hannah.id,
    appId: linear.appId,
    role: null,
    assignedBy: owner.user!.userId,
  });

  const changes = await provisionShown(hannah.id);

  expect(changes).toMatchObject([
    {
      action: "reactivate",
      appAccountId: linear.account(hannah.email).id,
      startedFrom: "provision",
      employeeId: hannah.id,
      status: "running",
    },
  ]);
});

test("Try again after a failed provisioned invite keeps Provision as its start", async ({
  workspace: { assignLinearRole, service, owner, ivan, input, provisionShown },
  fakeConnectors,
}) => {
  await assignLinearRole(null);
  const [failed] = await provisionShown(ivan.id);
  await failLinearCall(fakeConnectors.url, "actions/run", "unexpected_response");
  await service.runChange(SYSTEM, failed!.id);

  const { latestInvite } = await service.inviteEmployee(owner, input);

  expect(latestInvite).toMatchObject({ startedFrom: "provision", employeeId: ivan.id });
});

test("Try again after a failed provisioned Enable keeps Provision as its start", async ({
  workspace: { service, owner, employee, linear, provisionShown },
  seed,
  fakeConnectors,
}) => {
  const hannah = employee("hannah@acme.example");
  await seed.assignedTemplateApp({
    employeeId: hannah.id,
    appId: linear.appId,
    role: null,
    assignedBy: owner.user!.userId,
  });
  const [failed] = await provisionShown(hannah.id);
  await failLinearCall(fakeConnectors.url, "actions/run", "unexpected_response");
  await service.runChange(SYSTEM, failed!.id);

  const again = await service.changeAccount(owner, {
    appAccountId: failed!.appAccountId!,
    action: "reactivate",
  });

  expect(again).toMatchObject({ startedFrom: "provision", employeeId: hannah.id });
});

test("Provision offers no Enable the app refused, which stays with its row", async ({
  workspace: { provisionShown, service, pages, owner, employee, linear },
  seed,
  fakeConnectors,
}) => {
  const hannah = employee("hannah@acme.example");
  await seed.assignedTemplateApp({
    employeeId: hannah.id,
    appId: linear.appId,
    role: null,
    assignedBy: owner.user!.userId,
  });
  const [refused] = await provisionShown(hannah.id);
  await failLinearCall(fakeConnectors.url, "actions/run", "not_allowed");

  await service.runChange(SYSTEM, refused!.id);

  expect(await pages(owner, [hannah.id])).toMatchObject([{ provisionSteps: [] }]);
});

test("Provision still offers Enable after the app refused to remove the account", async ({
  workspace: { service, pages, owner, employee, linear },
  seed,
  fakeConnectors,
}) => {
  const hannah = employee("hannah@acme.example");
  await seed.assignedTemplateApp({
    employeeId: hannah.id,
    appId: linear.appId,
    role: null,
    assignedBy: owner.user!.userId,
  });
  const remove = await service.changeAccount(owner, {
    appAccountId: linear.account(hannah.email).id,
    action: "remove",
  });
  await failLinearCall(fakeConnectors.url, "actions/run", "not_allowed");

  await service.runChange(SYSTEM, remove.id);

  expect(await pages(owner, [hannah.id])).toMatchObject([
    { provisionSteps: [{ appId: linear.appId, action: "reactivate" }] },
  ]);
});

test("an app without a connection fails at once with no_connection and reaches no connector", async ({
  workspace: { ivan, assignAppWithoutConnection, sent, provisionShown },
}) => {
  const app = await assignAppWithoutConnection();

  const changes = await provisionShown(ivan.id);

  expect(changes).toMatchObject([
    {
      action: "invite",
      appId: app.id,
      connectionId: null,
      email: ivan.email,
      startedFrom: "provision",
      employeeId: ivan.id,
      status: "failed",
      error: "no_connection",
      attempts: [],
    },
  ]);
  expect(sent).toEqual([]);
});

test("a second Provision writes no second change for an app", async ({
  workspace: { assignLinearRole, assignAppWithoutConnection, ivan, provisionShown },
  orm,
}) => {
  await assignLinearRole(null);
  await assignAppWithoutConnection();
  await provisionShown(ivan.id);

  const again = await provisionShown(ivan.id);

  expect(again).toEqual([]);
  expect(await orm.select().from(accountChanges)).toHaveLength(2);
});

test("two Provisions asked at once write one change for each app", async ({
  workspace: { assignLinearRole, assignAppWithoutConnection, provision, owner, ivan, linear },
  orm,
}) => {
  await assignLinearRole(null);
  await assignAppWithoutConnection();

  const app = await assignAppWithoutConnection();
  const confirmed = { employeeId: ivan.id, appIds: [linear.appId, app.id] };

  await Promise.all([
    provision.provisionEmployee(owner, confirmed),
    provision.provisionEmployee(owner, confirmed),
  ]);

  expect(await orm.select().from(accountChanges)).toHaveLength(2);
});

test("provisions only the apps the owner confirmed", async ({
  workspace: { assignLinearRole, assignAppWithoutConnection, provision, owner, ivan, linear },
}) => {
  await assignLinearRole(null);
  await assignAppWithoutConnection();

  const changes = await provision.provisionEmployee(owner, {
    employeeId: ivan.id,
    appIds: [linear.appId],
  });

  expect(changes).toMatchObject([{ appId: linear.appId, action: "invite" }]);
});

test("Provision asked after a failed Invite on the row starts from Provision", async ({
  workspace: { assignLinearRole, provisionShown, service, owner, ivan, input },
  fakeConnectors,
}) => {
  await assignLinearRole(null);
  const { latestInvite } = await service.inviteEmployee(owner, input);
  await failLinearCall(fakeConnectors.url, "actions/run", "unexpected_response");
  await service.runChange(SYSTEM, latestInvite!.id);

  const changes = await provisionShown(ivan.id);

  expect(changes).toMatchObject([{ startedFrom: "provision", employeeId: ivan.id }]);
});

test("refuses to provision while a missing app's templates disagree on its role", async ({
  workspace: { assignLinearRole, assignAppWithoutConnection, provision, owner, ivan, sent, linear },
  orm,
}) => {
  await assignLinearRole("admin");
  await assignLinearRole(null);
  const app = await assignAppWithoutConnection();

  await expect(
    provision.provisionEmployee(owner, { employeeId: ivan.id, appIds: [linear.appId, app.id] }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(sent).toEqual([]);
  expect(await orm.select().from(accountChanges)).toEqual([]);
});

test("refuses to provision an unknown employee", async ({ workspace: { provision, owner } }) => {
  await expect(
    provision.provisionEmployee(owner, {
      employeeId: "00000000-0000-4000-8000-000000000001",
      appIds: [],
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("Provision is offered for a missing app, not for one no template gives", async ({
  workspace: { assignAppWithoutConnection, pages, owner, ivan },
}) => {
  const app = await assignAppWithoutConnection();

  // Linear offers Ivan an Invite, but no template of his gives it.
  expect(await pages(owner, [ivan.id])).toMatchObject([
    { provisionSteps: [{ appId: app.id, action: "give_by_hand" }] },
  ]);
});

test("Provision counts a disabled account as missing and offers to enable it", async ({
  workspace: { pages, owner, employee, linear },
  seed,
}) => {
  const hannah = employee("hannah@acme.example");
  await seed.assignedTemplateApp({
    employeeId: hannah.id,
    appId: linear.appId,
    role: null,
    assignedBy: owner.user!.userId,
  });

  expect(await pages(owner, [hannah.id])).toMatchObject([
    {
      personApps: including({ appId: linear.appId, state: "missing" }),
      provisionSteps: [{ appId: linear.appId, action: "reactivate" }],
    },
  ]);
});

test("Provision offers nothing for an app Ivan is invited to", async ({
  workspace: { assignLinearRole, service, pages, owner, ivan, linear, provisionShown },
}) => {
  await assignLinearRole(null);
  const [invite] = await provisionShown(ivan.id);

  await service.runChange(SYSTEM, invite!.id);

  expect(await pages(owner, [ivan.id])).toMatchObject([
    { personApps: including({ appId: linear.appId, state: "invited" }), provisionSteps: [] },
  ]);
});

/** A list holding a row like `row`, among the person's other apps. */
function including(row: Record<string, unknown>): unknown {
  return expect.arrayContaining([expect.objectContaining(row)]);
}
