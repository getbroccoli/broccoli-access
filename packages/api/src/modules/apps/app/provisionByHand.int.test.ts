import { employeeServices, expect, inviteTest as test } from "#test/support";

test("an app without a connection waits for I did it by hand, then shows Ivan invited", async ({
  workspace: { assignAppWithoutConnection, service, pages, owner, ivan, provisionShown },
}) => {
  const app = await assignAppWithoutConnection();
  const [change] = await provisionShown(ivan.id);
  const [waiting] = await pages(owner, [ivan.id]);

  await service.markChangeDoneByHand(owner, change!.id);

  expect(waiting).toMatchObject({
    personApps: including({ appId: app.id, state: "missing" }),
    appInvites: including({ appId: app.id, offered: false, invitedAt: null }),
    provisionSteps: [],
  });
  const [done] = await pages(owner, [ivan.id]);
  expect(done).toMatchObject({
    personApps: including({ appId: app.id, state: "invited" }),
    appInvites: including({ appId: app.id, invitedAt: expect.any(Date) as unknown }),
    provisionSteps: [],
  });
});

test("a by-hand invite stays with its person when their work email changes", async ({
  workspace: { assignAppWithoutConnection, provisionShown, pages, owner, ivan },
  orm,
}) => {
  const app = await assignAppWithoutConnection();
  await provisionShown(ivan.id);

  await employeeServices(orm).updateEmployee(owner, {
    id: ivan.id,
    email: "ivan.petrov@acme.example",
  });

  const [page] = await pages(owner, [ivan.id]);
  expect(page).toMatchObject({ appInvites: including({ appId: app.id, offered: false }) });
});

test("a by-hand invite leaves the person's rows once they hold an account in the app", async ({
  workspace: { assignAppWithoutConnection, provisionShown, pages, owner, ivan },
  seed,
}) => {
  const app = await assignAppWithoutConnection();
  await provisionShown(ivan.id);

  await seed.appAccount({ appId: app.id, email: ivan.email, employeeId: ivan.id });

  const [page] = await pages(owner, [ivan.id]);
  expect(page!.appInvites.filter(({ appId }) => appId === app.id)).toEqual([]);
});

test("refuses I did it by hand once the app is connected", async ({
  workspace: { assignAppWithoutConnection, provisionShown, service, owner, ivan },
  seed,
}) => {
  const app = await assignAppWithoutConnection();
  const [change] = await provisionShown(ivan.id);
  await seed.appConnection({ appId: app.id, connector: "slack" });

  await expect(service.markChangeDoneByHand(owner, change!.id)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

/** A list holding a row like `row`, among the person's other apps. */
function including(row: Record<string, unknown>): unknown {
  return expect.arrayContaining([expect.objectContaining(row)]);
}
