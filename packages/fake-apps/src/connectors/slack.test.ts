import { expect } from "vitest";

import {
  callConnector,
  control,
  listSlackPages,
  slackOwnerRequest,
  signInToFakeSlack,
  test as it,
} from "#test/support";
import { ACME } from "../seed";

it("offers Mia Novak's Slack sign-in with an HttpOnly cookie and local storage JSON", async ({
  connectors: { url },
}) => {
  const response = await fetch(`${url}/slack/signin`);
  const page = await response.text();

  expect(page).toContain("Sign in as Mia Novak");
  const cookie = response.headers.getSetCookie().find((header) => header.startsWith("d="));
  expect(cookie).toMatch(/^d=[^;]+;.*\bHttpOnly\b/i);
  const json = page.match(
    /<script\b(?=[^>]*\btype=["']application\/json["'])(?=[^>]*\bid=["']localConfig_v2["'])[^>]*>([\s\S]+?)<\/script>/i,
  )?.[1];
  expect(() => JSON.parse(json!) as unknown).not.toThrow();
});

it("discovers Acme's Slack settings from Mia's session", async ({ connectors: { url } }) => {
  const appSession = await signInToFakeSlack(url);

  const result = await testSession(url, { appSession });

  expect(result.body).toEqual({
    details: { organizationName: "Acme", domain: "acme.slack.com" },
    connection: { settings: { teamId: "T04ACME", teamDomain: "acme", teamName: "Acme" } },
  });
});

it("pages through Acme's 44 Slack members with Mia alone as the connection user", async ({
  connectors: { url },
}) => {
  const pages = await listSlackPages(url, (await slackOwnerRequest(url)).connection);
  const accounts = pages.flatMap((page) => page.accounts);

  const slack = ACME.apps.find((app) => app.name === "Slack")!;
  const emails = accounts.map(({ values }) => values.email);
  expect(emails).toHaveLength(44);
  expect(emails.sort()).toEqual(
    ACME.grants
      .filter((grant) => grant.clientId === slack.clientId)
      .map((grant) => grant.email)
      .concat(extraMembers.map(({ email }) => email))
      .sort(),
  );
  for (const member of extraMembers) {
    expect(accounts.map(({ values }) => values)).toContainEqual({
      ...member,
      status: "active",
      isConnectionUser: false,
    });
  }
  expect(emails).not.toContain("new.hire@acme.example");
  expect(
    accounts.filter(({ values }) => values.isConnectionUser).map(({ values }) => values.email),
  ).toEqual(["admin@acme.example"]);
  const statuses = Object.fromEntries(accounts.map(({ values }) => [values.email, values.status]));
  expect(statuses).toMatchObject({
    "elif@acme.example": "suspended",
    "ana@acme.example": "active",
    "ben@acme.example": "active",
  });
});

it("lists the seeded Slack invitation only on the first of three pages", async ({
  connectors: { url },
}) => {
  const pages = await listSlackPages(url, (await slackOwnerRequest(url)).connection);

  expect(pages.map((page) => page.invitations)).toEqual([
    [{ email: "new.hire@acme.example", invitedAt: null, expiresAt: null }],
    undefined,
    undefined,
  ]);
});

it("invites Ivan to Slack with no invitation dates", async ({ connectors: { url } }) => {
  const request = await slackOwnerRequest(url);
  const email = "ivan@acme.example";

  const result = await callConnector(url, "actions/run", {
    ...request,
    action: "invite",
    account: { email },
  });

  const invitation = { email, invitedAt: null, expiresAt: null };
  expect(result.body).toEqual({ changed: true, invitation });
  const list = await callConnector(url, "accounts/list", { ...request, cursor: null });
  expect(list.body).toHaveProperty("invitations", expect.arrayContaining([invitation]));
});

it("answers authentication_failed for a changed Slack cookie", async ({ connectors: { url } }) => {
  const appSession = await signInToFakeSlack(url);
  appSession.cookies[0]!.value += "-changed";

  const result = await testSession(url, { appSession });

  expect(result.body).toEqual({ error: { code: "authentication_failed" } });
});

it("answers authentication_failed without a Slack app session", async ({ connectors: { url } }) => {
  const result = await testSession(url, {});

  expect(result.body).toEqual({ error: { code: "authentication_failed" } });
});

it("answers authentication_failed for an expired Slack session", async ({
  connectors: { url },
}) => {
  const appSession = await signInToFakeSlack(url);
  await control(url, "/slack/sessions/expire");

  const result = await testSession(url, { appSession });

  expect(result.body).toEqual({ error: { code: "authentication_failed" } });
});

it("accepts a new Slack sign-in after sessions expire", async ({ connectors: { url } }) => {
  await signInToFakeSlack(url);
  await control(url, "/slack/sessions/expire");
  const appSession = await signInToFakeSlack(url);

  const result = await testSession(url, { appSession });

  expect(result.body).toMatchObject({
    details: { organizationName: "Acme", domain: "acme.slack.com" },
  });
});

function testSession(url: string, secrets: Record<string, unknown>) {
  return callConnector(url, "connections/test", {
    connector: "slack",
    runtime: { kind: "server" },
    connection: { settings: {}, secrets },
  });
}

const extraMembers = [
  { email: "ana.ruiz@gmail.example", displayName: "Ana Ruiz" },
  { email: "sam@agency.example", displayName: "Sam Lee" },
  { email: "reports@acme.example", displayName: "Reports bot" },
];
