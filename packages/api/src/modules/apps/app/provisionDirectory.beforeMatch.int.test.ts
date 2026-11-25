import { eq } from "drizzle-orm";
import { onTestFinished, vi } from "vitest";
import {
  createdGoogleUsers,
  directoryProvisionTest as test,
  expect,
  NEW_PERSON,
  postFakeControl,
  provisioning,
  recordingJobQueue,
  serveManifest,
  storedAppAccounts,
  SYSTEM,
} from "#test/support";
import { accountChanges } from "../db";

test("a directory worker retry queues the confirmed Linear invite once after Linear returns", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
  provisionPerson,
  workspace: { owner, linear, service, sent },
}) => {
  const appIds = [linear.appId];
  const template = await seed.template({ appIds });
  const { employeeId, changeId } = await provisionPerson({ templateIds: [template.id], appIds });
  const job = { changeId, appIds };
  expect(sent).toMatchObject([{ name: "apps.runDirectoryProvision", payload: job }]);
  const withoutLinear = await serveManifest(fakeConnectors.url, (manifest) => {
    manifest.connectors = manifest.connectors.filter(({ key }) => key !== "linear");
  });
  const { jobs, sent: workerJobs } = recordingJobQueue();
  const worker = (connectorsUrl: string) =>
    provisioning(orm, { connectorsUrl, googleUrl: fakeGoogle.url, jobs });
  const googleRequests = vi.spyOn(globalThis, "fetch");
  onTestFinished(() => {
    googleRequests.mockRestore();
  });

  const [firstAttempt] = await Promise.allSettled([
    worker(withoutLinear.url).runDirectoryProvision(SYSTEM, job),
  ]);
  expect(workerJobs).toEqual([]);
  const retry = worker(fakeConnectors.url);
  await retry.runDirectoryProvision(SYSTEM, job);
  await retry.runDirectoryProvision(SYSTEM, job);

  expect(await service.readAccountChange(owner, changeId)).toMatchObject({ status: "succeeded" });
  const [linearChange] = await orm
    .select()
    .from(accountChanges)
    .where(eq(accountChanges.appId, linear.appId));
  expect(linearChange).toMatchObject({ employeeId, action: "invite", status: "running" });
  expect(workerJobs).toEqual([
    {
      name: "apps.runAccountChange",
      payload: { changeId: linearChange!.id },
      options: { group: linear.connectionId },
    },
  ]);
  expect(await createdGoogleUsers(fakeGoogle.url)).toMatchObject([
    { primaryEmail: NEW_PERSON.email },
  ]);
  expect(
    googleRequests.mock.calls.filter(
      ([url, init]) =>
        url instanceof URL &&
        url.href === `${fakeGoogle.url}/admin/directory/v1/users` &&
        init?.method === "POST",
    ),
  ).toHaveLength(1);
  expect(firstAttempt?.status, "An incomplete job must be retried").toBe("rejected");
});

test("Activity sees Google creation and the queued Linear invite become visible together", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
  provisionPerson,
  workspace: { owner, google, linear, service },
}) => {
  const appIds = [linear.appId];
  const template = await seed.template({ appIds });
  const { changeId } = await provisionPerson({ templateIds: [template.id], appIds });
  const { jobs } = recordingJobQueue();
  const queued = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const worker = provisioning(orm, {
    googleUrl: fakeGoogle.url,
    connectorsUrl: fakeConnectors.url,
    jobs: {
      async send(tx, name, payload, options) {
        await jobs.send(tx, name, payload, options);
        if (name !== "apps.runAccountChange") return;
        queued.resolve();
        await release.promise;
      },
    },
  });
  const activity = async () =>
    new Map(
      (await service.listAccountChanges(owner, {})).edges.map(({ node }) => [
        node.connectionId,
        node.status,
      ]),
    );

  const running = worker.runDirectoryProvision(SYSTEM, { changeId, appIds });
  try {
    await Promise.race([
      queued.promise,
      running.then(() => {
        throw new Error("The directory worker finished without queuing the Linear invite");
      }),
    ]);
    expect(await activity()).toEqual(new Map([[google.connectionId, "running"]]));
  } finally {
    release.resolve();
    await running;
  }

  expect(await activity()).toEqual(
    new Map([
      [google.connectionId, "succeeded"],
      [linear.connectionId, "running"],
    ]),
  );
});

test.for(["direct invite", "Provision"] as const)(
  "%s cannot add apps after a completed scan omits the newly created Google account",
  async (
    action,
    {
      provisionPerson,
      workspace: { owner, google, linear, provision, service },
      seed,
      orm,
      fakeGoogle,
    },
  ) => {
    const appId = linear.appId;
    const template = await seed.template({ appIds: [appId] });
    const { employeeId, changeId, run } = await provisionPerson({ templateIds: [template.id] });
    await run();
    expect(await service.readAccountChange(owner, changeId)).toMatchObject({ status: "succeeded" });
    await postFakeControl(fakeGoogle.url, `users/${NEW_PERSON.email}/delete`);
    await google.scans.scanNow(owner, google.connectionId);
    await google.scans.runScan(SYSTEM, google.sourceId);
    expect(await google.scans.readScan(owner, google.connectionId)).toMatchObject({
      status: "scanned",
    });
    expect(
      (await storedAppAccounts(orm)).filter(({ email }) => email === NEW_PERSON.email),
    ).toEqual([]);

    if (action === "direct invite") {
      await expect(service.inviteEmployee(owner, { employeeId, appId })).rejects.toMatchObject({
        code: "CONFLICT",
      });
    } else {
      expect(await provision.provisionEmployee(owner, { employeeId, appIds: [appId] })).toEqual([]);
    }

    expect(
      await orm.select().from(accountChanges).where(eq(accountChanges.email, NEW_PERSON.email)),
    ).toMatchObject([{ id: changeId, status: "succeeded" }]);
  },
);
