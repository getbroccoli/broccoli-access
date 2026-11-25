import {
  expect,
  failLinearCall,
  offboardedTest as test,
  SYSTEM,
  postFakeControl,
  linearMemberStatus,
} from "#test/support";
import { eq } from "drizzle-orm";
import type { Orm } from "../../../core/db";
import { accountChanges as changesTable } from "../db";

test("keeps only the failed Slack account in accounts to remove after Remove all", async ({
  orm,
  fakeConnectors,
  workspace: { service, owner, linear },
  offboarded: { employeeId, slackAppId },
}) => {
  const [plan] = await service.readOffboardings(owner, [employeeId]);
  await service.removeEmployeeAccounts(owner, {
    employeeId,
    accountIds: plan!.accountsToRemove.map(({ id }) => id),
  });
  const changes = await removeChanges(orm);
  const slackRemove = changes.find((change) => change.appId === slackAppId)!;
  const linearRemove = changes.find((change) => change.appId === linear.appId)!;
  await postFakeControl(fakeConnectors.url, "failures", {
    connector: "slack",
    call: "actions/run",
    code: "unexpected_response",
    count: 1,
  });

  await service.runChange(SYSTEM, slackRemove.id);
  await service.runChange(SYSTEM, linearRemove.id);

  expect(await service.readAccountChange(owner, slackRemove.id)).toMatchObject({
    status: "failed",
    error: "unexpected_response",
  });
  expect(await service.readAccountChange(owner, linearRemove.id)).toMatchObject({
    status: "succeeded",
  });
  const [after] = await service.readOffboardings(owner, [employeeId]);
  expect(after!.accountsToRemove).toMatchObject([{ id: slackRemove.appAccountId }]);
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

function removeChanges(orm: Orm) {
  return orm
    .select()
    .from(changesTable)
    .where(eq(changesTable.action, "remove"))
    .orderBy(changesTable.id);
}
