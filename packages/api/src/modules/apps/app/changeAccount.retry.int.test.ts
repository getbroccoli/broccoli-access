import {
  accountChanges,
  expect,
  failLinearCall,
  postFakeControl,
  recordingJobQueue,
  scannedLinear,
  SYSTEM,
  test,
} from "#test/support";

test("offers and queues a retry of a failed Remove before a scan sees the Disable", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const appAccountId = linear.account("chloe@acme.example").id;
  const { jobs, sent } = recordingJobQueue();
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url, jobs });
  const disable = await service.changeAccount(owner, { appAccountId, action: "suspend" });
  await service.runChange(SYSTEM, disable.id);
  const input = { appAccountId, action: "remove" } as const;
  const failed = await service.changeAccount(owner, input);
  await failLinearCall(fakeConnectors.url, "actions/run", "unexpected_response");
  await service.runChange(SYSTEM, failed.id);

  const states = await service.readChangeStates(owner, [appAccountId]);
  expect(states.get(appAccountId)?.latestChange).toMatchObject({
    id: failed.id,
    status: "failed",
    error: "unexpected_response",
  });
  expect.soft(states.get(appAccountId)?.offersRemove).toBe(true);
  const retry = await service.changeAccount(owner, { ...input, retryOf: failed.id });

  expect(retry.id).not.toBe(failed.id);
  expect(retry).toMatchObject({ ...input, status: "running" });
  expect(sent).toContainEqual({
    name: "apps.runAccountChange",
    payload: { changeId: retry.id },
    options: { group: linear.connectionId },
  });
});

test.for(["same member", "replacement"] as const)(
  "retrying Remove checks the original member key (%s)",
  async (target, { orm, seed, fakeConnectors }) => {
    const owner = await seed.owner();
    const url = fakeConnectors.url;
    const linear = await scannedLinear(orm, url);
    const account = linear.account("hannah@acme.example");
    const input = { appAccountId: account.id, action: "remove" } as const;
    const service = accountChanges(orm, { connectorsUrl: url });
    const failed = await service.changeAccount(owner, input);
    await failLinearCall(url, "actions/run", "unexpected_response");
    await service.runChange(SYSTEM, failed.id);
    if (target === "replacement") {
      await postFakeControl(url, `linear/members/${account.email}/remove`);
      await postFakeControl(url, "linear/invitations", { email: account.email });
      await postFakeControl(url, `linear/invitations/${account.email}/accept`);
      await postFakeControl(url, `linear/members/${account.email}/suspend`);
    }
    await linear.scans.scanNow(owner, linear.connectionId);
    await linear.scans.runScan(SYSTEM, linear.sourceId);

    const retry = service.changeAccount(owner, { ...input, retryOf: failed.id });

    if (target === "same member") {
      await expect(retry).resolves.toMatchObject({
        sourceKey: failed.sourceKey,
        status: "running",
      });
    } else {
      await expect(retry).rejects.toMatchObject({ code: "CONFLICT" });
      const states = await service.readChangeStates(owner, [account.id]);
      expect(states.get(account.id)).toMatchObject({ offersRemove: true, latestChange: null });
      expect((await service.listAccountChanges(owner, {})).edges).toMatchObject([
        { node: { id: failed.id, status: "failed" } },
      ]);
    }
  },
);
