import {
  addPersonService,
  expect,
  expectBlockedBy,
  holdBeforeCommit,
  inviteTest as test,
  NEW_PERSON,
  storedEmployees,
  SYSTEM,
  templates,
  withLockTimeout,
} from "#test/support";
import { createAppAccountService } from "./appAccountService";

test("account writers can acquire the sync lock while Add person waits for a template", async ({
  orm,
  seed,
  transact,
  workspace: { owner, linear, templates: assignments },
}) => {
  const template = await seed.template({ appIds: [linear.appId] });
  const held = holdBeforeCommit(transact);
  const renaming = templates(orm, { transact: held.transact }).updateTemplate(owner, {
    id: template.id,
    name: "Engineering",
  });
  const pid = await held.ready;
  const adding = addPersonService(orm).addPerson(owner, {
    ...NEW_PERSON,
    templateIds: [template.id],
  });
  const result = Promise.allSettled([adding]);

  try {
    await expectBlockedBy(orm, pid);
    await withLockTimeout(transact)((tx) => createAppAccountService().holdAccountSyncs(SYSTEM, tx));
  } finally {
    held.release();
    await Promise.all([renaming, result]);
  }

  const { id } = await adding;
  expect(await assignments.readEmployeeTemplates(owner, [id])).toMatchObject([
    [{ id: template.id, name: "Engineering" }],
  ]);
});

test("Add person saves no employee or assignment when a requested template is deleted while it waits", async ({
  orm,
  seed,
  transact,
  workspace: { owner, templates: assignments },
}) => {
  const kept = await seed.template();
  const removed = await seed.template();
  const held = holdBeforeCommit(transact);
  const deleting = templates(orm, { transact: held.transact }).deleteTemplate(owner, removed.id);
  const pid = await held.ready;
  const adding = addPersonService(orm).addPerson(owner, {
    ...NEW_PERSON,
    templateIds: [kept.id, removed.id],
  });
  const result = Promise.allSettled([adding]);

  try {
    await expectBlockedBy(orm, pid);
    expect((await storedEmployees(orm)).map(({ email }) => email)).not.toContain(NEW_PERSON.email);
  } finally {
    held.release();
    await Promise.all([deleting, result]);
  }

  expect(await result).toMatchObject([{ status: "rejected", reason: { code: "NOT_FOUND" } }]);
  expect((await storedEmployees(orm)).map(({ email }) => email)).not.toContain(NEW_PERSON.email);
  expect(await assignments.readTemplatePeople(owner, kept.id, {})).toMatchObject({ edges: [] });
});
