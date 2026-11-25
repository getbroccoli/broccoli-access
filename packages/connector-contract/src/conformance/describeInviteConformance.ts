import { expect, it, type TestContext } from "vitest";

import { ACTION_RUN_ANSWER, type ActionRunAnswer, type Invitation } from "../connectorCalls.js";
import type { ConnectorFixture } from "./describeConnectorConformance.js";
import {
  capabilitiesOf,
  listAll,
  listAllInvitations,
  post,
  requestOf,
  rolesOf,
  runtimesOf,
  send,
  skipUnlessListed,
  startFlow,
  unlistedRuntimes,
  type Flow,
} from "./flow.js";

/**
 * The invite checks of one connector; a connector that does not list `invite` skips them, and
 * one that lists no `roles` skips the check of a role.
 */
export function describeInviteConformance(url: string, fixture: ConnectorFixture): void {
  it("sends one invitation when invite repeats, and reports the invitation read afterwards", async ({
    skip,
  }) => checkRepeatedInvite(url, fixture, await inviteeOf(url, fixture, skip)));
  it("lists the invitation that invite just sent, once even after a retry", async ({ skip }) => {
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
  it("answers an invite with a role the connector does not list with HTTP 400", async ({
    skip,
  }) => {
    const invitee = await inviteeOf(url, fixture, skip);
    const roles =
      (await rolesOf(url, fixture.connector)) ?? skip(`${fixture.connector} lists no roles`);
    // The manifest's schema allows one default only, so this fails only on a schema left behind.
    expect(roles.filter((role) => role.isDefault)).toHaveLength(1);
    return checkInviteWithUnlistedRole(url, fixture, invitee);
  });
}

/** A role key no connector lists. */
const UNLISTED_ROLE = "conformance_unlisted_role";

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
  // The retry reads back the invitation the first call sent.
  expect(invitationReadBack(second)).toEqual(invitationReadBack(first));
}

async function checkListedInvitation(
  url: string,
  fixture: ConnectorFixture,
  invitee: Invitee,
): Promise<void> {
  const [flow] = await startFlow(url, fixture);

  const sent = invitationReadBack(await invite(flow, invitee));
  const listedAfterInvite = await listedInvitationsOf(flow, invitee);
  await invite(flow, invitee);
  const listedAfterRetry = await listedInvitationsOf(flow, invitee);

  expect(listedAfterInvite).toEqual([sent]);
  expect(listedAfterRetry).toEqual([sent]);
}

async function checkInviteOfMember(url: string, fixture: ConnectorFixture): Promise<void> {
  const [flow] = await startFlow(url, fixture);
  const listed = (await listAll(flow)).find(({ values }) => values.status === "active");
  expect(listed, "an active member for the invite to read back").toBeDefined();

  const answer = await invite(flow, { email: listed!.values.email });

  expect(answer.changed).toBe(false);
  expect(answer.account?.sourceKey).toBe(listed!.sourceKey);
  expect(answer.account?.values.status).toBe("active");
}

/** A valid invite with only its runtime changed, which must send nothing. */
async function checkInviteOnUnlistedRuntimes(
  url: string,
  fixture: ConnectorFixture,
  invitee: Invitee,
): Promise<void> {
  const listed = await runtimesOf(url, fixture.connector);
  const [flow] = await startFlow(url, fixture);

  for (const runtime of unlistedRuntimes(listed)) {
    const body = { ...requestOf(flow), ...inviteFields(invitee), runtime };
    expect((await post(url, "actions/run", body)).status, `invite on ${runtime.kind}`).toBe(400);
  }

  const answer = await invite(flow, invitee);
  expect(answer.changed, "an invite after the refused ones").toBe(true);
}

/** A valid invite with only an unlisted role added, which must send nothing. */
async function checkInviteWithUnlistedRole(
  url: string,
  fixture: ConnectorFixture,
  invitee: Invitee,
): Promise<void> {
  const [flow] = await startFlow(url, fixture);
  const account = { ...invitee, role: UNLISTED_ROLE };
  const body = { ...requestOf(flow), action: "invite", account };

  expect((await post(url, "actions/run", body)).status).toBe(400);

  const answer = await invite(flow, invitee);
  expect(answer.changed, "an invite after the refused one").toBe(true);
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
  await skipUnlessListed(url, fixture, "invite", skip);
  const message = `${fixture.connector} lists invite, so its fixture needs an invitee`;
  expect(fixture.invitee, message).toBeDefined();
  return fixture.invitee!;
}

async function invite(flow: Flow, invitee: Invitee): Promise<ActionRunAnswer> {
  return ACTION_RUN_ANSWER.parse(await send(flow, "actions/run", inviteFields(invitee)));
}

function inviteFields(invitee: Invitee) {
  return { action: "invite", account: invitee };
}

async function listedInvitationsOf(flow: Flow, invitee: Invitee) {
  const invitations = await listAllInvitations(flow);
  return invitations.filter(({ email }) => email === invitee.email).map(withInstants);
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
