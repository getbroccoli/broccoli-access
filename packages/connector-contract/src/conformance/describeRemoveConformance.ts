import { expect, it, type TestContext } from "vitest";

import { ACTION_RUN_ANSWER, CONNECTOR_ERROR_ANSWER } from "../connectorCalls.js";
import type { ConnectorFixture } from "./describeConnectorConformance.js";
import { capabilitiesOf, listAll, send, skipUnlessListed, startFlow, type Flow } from "./flow.js";

/** The remove checks of one connector; a connector that does not list `remove` skips them. */
export function describeRemoveConformance(url: string, fixture: ConnectorFixture): void {
  it("removes the member once when remove repeats, and the next list is without them", async ({
    skip,
  }) => checkRepeatedRemove(url, fixture, await memberToRemoveOf(url, fixture, skip)));
  it("answers a remove of the connection's own member with not_allowed", async ({ skip }) => {
    await skipUnlessListed(url, fixture, "remove", skip);
    return checkRemoveOfConnectionUser(url, fixture, skip);
  });
}

type Member = NonNullable<ConnectorFixture["memberToRemove"]>;

async function checkRepeatedRemove(
  url: string,
  fixture: ConnectorFixture,
  member: Member,
): Promise<void> {
  const [flow] = await startFlow(url, fixture);
  const listedMember = (await listAll(flow)).find(
    ({ sourceKey }) => sourceKey === member.sourceKey,
  );
  expect(listedMember?.values.status, "the fixture's member to remove").toBe("active");

  const capabilities = await capabilitiesOf(url, fixture.connector);
  if (capabilities.includes("suspend")) {
    const refused = await send(flow, "actions/run", { action: "remove", account: member });
    expect(CONNECTOR_ERROR_ANSWER.parse(refused).error.code).toBe("not_allowed");
    const suspended = await send(flow, "actions/run", { action: "suspend", account: member });
    expect(ACTION_RUN_ANSWER.parse(suspended).account?.values.status).toBe("suspended");
  }

  const first = await remove(flow, member);
  const listed = await listAll(flow);
  const second = await remove(flow, member);

  expect(listed.map(({ sourceKey }) => sourceKey)).not.toContain(member.sourceKey);
  expect([first, second]).toEqual([
    { changed: true, removed: true },
    { changed: false, removed: true },
  ]);
}

async function checkRemoveOfConnectionUser(
  url: string,
  fixture: ConnectorFixture,
  skip: TestContext["skip"],
): Promise<void> {
  const [flow] = await startFlow(url, fixture);
  const own = (await listAll(flow)).find(({ values }) => values.isConnectionUser);
  if (!own) return skip(`${fixture.connector} lists no connection member`);
  const account = { sourceKey: own.sourceKey, email: own.values.email };

  const answer = await send(flow, "actions/run", { action: "remove", account });

  expect(CONNECTOR_ERROR_ANSWER.parse(answer).error.code).toBe("not_allowed");
  expect((await listAll(flow)).map(({ sourceKey }) => sourceKey)).toContain(own.sourceKey);
}

/**
 * The fixture's member to remove, which a connector that lists `remove` must have; skips the
 * check for any other connector.
 */
async function memberToRemoveOf(
  url: string,
  fixture: ConnectorFixture,
  skip: TestContext["skip"],
): Promise<Member> {
  await skipUnlessListed(url, fixture, "remove", skip);
  const message = `${fixture.connector} lists remove, so its fixture needs a memberToRemove`;
  expect(fixture.memberToRemove, message).toBeDefined();
  return fixture.memberToRemove!;
}

async function remove(flow: Flow, account: Member) {
  const answer = await send(flow, "actions/run", { action: "remove", account });
  const { changed, removed } = ACTION_RUN_ANSWER.parse(answer);
  return { changed, removed };
}
