import { expect, it, type TestContext } from "vitest";

import { ACTION_RUN_ANSWER, type ActionRunAnswer, type Invitation } from "../connectorCalls.js";
import type { ConnectorFixture } from "./describeConnectorConformance.js";
import {
  capabilitiesOf,
  listAllInvitations,
  post,
  requestOf,
  runtimesOf,
  send,
  startFlow,
  unlistedRuntimes,
  type Flow,
} from "./flow.js";

/** The invite checks of one connector; a connector that does not list `invite` skips them. */
export function describeInviteConformance(url: string, fixture: ConnectorFixture): void {
  it("sends one invitation when invite repeats, and reports the invitation read afterwards", async ({
    skip,
  }) => checkRepeatedInvite(url, fixture, await inviteeOf(url, fixture, skip)));
  it("lists the one invitation that a repeated invite sent", async ({ skip }) => {
    const invitee = await inviteeOf(url, fixture, skip);
    if (!(await capabilitiesOf(url, fixture.connector)).includes("list_invitations"))
      skip(`${fixture.connector} does not list list_invitations`);
    return checkListedInvitation(url, fixture, invitee);
  });
  it("answers an invite of a member's email with that member, unchanged", async ({ skip }) => {
    await inviteeOf(url, fixture, skip);
    return checkInviteOfMember(url, fixture);
  });
  it("answers an invite on a runtime the connector does not list with HTTP 400", async ({ skip }) =>
    checkInviteOnUnlistedRuntimes(url, fixture, await inviteeOf(url, fixture, skip)));
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

  expect([first.changed, second.changed]).toEqual([true, false]);
  expect(invitationReadBack(first).email).toBe(invitee.email);
  // The same invitation read back, so no second one went out.
  expect(invitationReadBack(second)).toEqual(invitationReadBack(first));
}

async function checkListedInvitation(
  url: string,
  fixture: ConnectorFixture,
  invitee: Invitee,
): Promise<void> {
  const [flow] = await startFlow(url, fixture);

  const sent = invitationReadBack(await invite(flow, invitee));
  await invite(flow, invitee);
  const listed = (await listAllInvitations(flow)).filter(({ email }) => email === invitee.email);

  expect(listed.map(withInstants)).toEqual([sent]);
}

async function checkInviteOfMember(url: string, fixture: ConnectorFixture): Promise<void> {
  const [flow] = await startFlow(url, fixture);

  const answer = await invite(flow, { email: fixture.member.email });

  expect(answer.changed).toBe(false);
  expect(answer.account?.sourceKey).toBe(fixture.member.sourceKey);
  expect(answer.account?.values.status).toBe("active");
}

/** A valid invite with only its runtime changed. */
async function checkInviteOnUnlistedRuntimes(
  url: string,
  fixture: ConnectorFixture,
  invitee: Invitee,
): Promise<void> {
  const listed = await runtimesOf(url, fixture.connector);
  const [flow] = await startFlow(url, fixture);

  for (const runtime of unlistedRuntimes(listed)) {
    const body = { ...requestOf(flow, "actions/run"), action: "invite", account: invitee, runtime };
    expect((await post(url, "actions/run", body)).status, `invite on ${runtime.kind}`).toBe(400);
  }
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

function invitationReadBack(answer: ActionRunAnswer) {
  expect(answer.invitation, "the invitation read back").toBeDefined();
  return withInstants(answer.invitation!);
}

/** ISO 8601 writes one instant in several ways, so dates compare as instants. */
function withInstants({ email, invitedAt, expiresAt }: Invitation) {
  return { email, invitedAt: instantOf(invitedAt), expiresAt: instantOf(expiresAt) };
}

function instantOf(date: string | null): number | null {
  return date === null ? null : Date.parse(date);
}
