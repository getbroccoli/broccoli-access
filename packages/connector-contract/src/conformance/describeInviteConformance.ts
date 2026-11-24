import { expect, it, type TestContext } from "vitest";

import { ACTION_RUN_ANSWER, type ActionRunAnswer } from "../connectorCalls.js";
import type { ConnectorFixture } from "./describeConnectorConformance.js";
import { capabilitiesOf, listAllInvitations, send, startFlow, type Flow } from "./flow.js";

/** The invite checks of one connector; a connector that does not list `invite` skips them. */
export function describeInviteConformance(url: string, fixture: ConnectorFixture): void {
  it("sends one invitation when invite repeats, and reports the invitation read afterwards", async ({
    skip,
  }) => checkRepeatedInvite(url, fixture, await inviteeOf(url, fixture, skip)));
  it("lists the invitation that invite just sent", async ({ skip }) => {
    const invitee = await inviteeOf(url, fixture, skip);
    if (!(await capabilitiesOf(url, fixture.connector)).includes("list_invitations"))
      skip(`${fixture.connector} does not list list_invitations`);
    return checkListedInvitation(url, fixture, invitee);
  });
  it("answers an invite of a member's email with that member, unchanged", async ({ skip }) => {
    await inviteeOf(url, fixture, skip);
    return checkInviteOfMember(url, fixture);
  });
}

type Invitee = NonNullable<ConnectorFixture["invitee"]>;

async function checkRepeatedInvite(
  url: string,
  fixture: ConnectorFixture,
  invitee: Invitee,
): Promise<void> {
  const [flow] = await startFlow(url, fixture);

  const first = await invite(flow, invitee);
  const second = await invite(flow, invitee);

  expect(first).toMatchObject({ changed: true, invitation: { email: invitee.email } });
  // The same invitation read back, so no second one went out.
  expect(second).toMatchObject({ changed: false, invitation: first.invitation });
}

async function checkListedInvitation(
  url: string,
  fixture: ConnectorFixture,
  invitee: Invitee,
): Promise<void> {
  const [flow] = await startFlow(url, fixture);

  const { invitation } = await invite(flow, invitee);
  const listed = (await listAllInvitations(flow)).filter(({ email }) => email === invitee.email);

  expect(listed).toEqual([invitation]);
}

async function checkInviteOfMember(url: string, fixture: ConnectorFixture): Promise<void> {
  const [flow] = await startFlow(url, fixture);

  const answer = await invite(flow, { email: fixture.member.email });

  expect(answer.changed).toBe(false);
  expect(answer.account?.sourceKey).toBe(fixture.member.sourceKey);
  expect(answer.account?.values.status).toBe("active");
}

/**
 * The fixture's invitee, which a connector that lists `invite` must have; skips the check for
 * any other connector.
 */
async function inviteeOf(
  url: string,
  fixture: ConnectorFixture,
  skip: TestContext["skip"],
): Promise<Invitee> {
  if (!(await capabilitiesOf(url, fixture.connector)).includes("invite"))
    skip(`${fixture.connector} does not list invite`);
  const message = `${fixture.connector} lists invite, so its fixture needs an invitee`;
  expect(fixture.invitee, message).toBeDefined();
  return fixture.invitee!;
}

async function invite(flow: Flow, invitee: Invitee): Promise<ActionRunAnswer> {
  const answer = await send(flow, "actions/run", { action: "invite", account: invitee });
  return ACTION_RUN_ANSWER.parse(answer);
}
