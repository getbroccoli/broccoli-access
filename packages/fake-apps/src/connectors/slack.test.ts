import { ACCOUNTS_LIST_ANSWER } from "@broccoli-access/connector-contract";
import { expect } from "vitest";

import { callConnector, control, signInToFakeSlack, test as it } from "#test/support";
import { ACME, ACME_SLACK } from "../seed";

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

it("pages through Acme's 41 Slack members with Mia alone as the connection user", async ({
  connectors: { url },
}) => {
  const pages = await listSlackPages(url);
  const accounts = pages.flatMap((page) => page.accounts);

  const slack = ACME.apps.find((app) => app.name === "Slack")!;
  const emails = accounts.map(({ values }) => values.email);
  expect(emails).toHaveLength(41);
  expect(emails.sort()).toEqual(
    ACME.grants
      .filter((grant) => grant.clientId === slack.clientId)
      .map((grant) => grant.email)
      .sort(),
  );
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
  const pages = await listSlackPages(url);

  expect(pages.map((page) => page.invitations)).toEqual([
    [{ email: "new.hire@acme.example", invitedAt: null, expiresAt: null }],
    undefined,
    undefined,
  ]);
});

it("invites Ivan to Slack with no invitation dates", async ({ connectors: { url } }) => {
  const appSession = await signInToFakeSlack(url);
  const email = "ivan@acme.example";

  const result = await callConnector(url, "actions/run", {
    connector: "slack",
    runtime: { kind: "server" },
    connection: { settings: ACME_SLACK.settings, secrets: { appSession } },
    action: "invite",
    account: { email },
  });

  expect(result.body).toMatchObject({
    changed: true,
    invitation: { email, invitedAt: null, expiresAt: null },
  });
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

async function listSlackPages(url: string) {
  const appSession = await signInToFakeSlack(url);
  const request = {
    connector: "slack",
    runtime: { kind: "server" },
    connection: { settings: ACME_SLACK.settings, secrets: { appSession } },
  };
  const pages = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const result = await callConnector(url, "accounts/list", { ...request, cursor });
    const page = ACCOUNTS_LIST_ANSWER.parse(result.body);
    pages.push(page);
    cursor = page.nextCursor;
    if (cursor !== null) {
      expect(cursors.has(cursor)).toBe(false);
      cursors.add(cursor);
    }
  } while (cursor !== null);
  return pages;
}

function testSession(url: string, secrets: Record<string, unknown>) {
  return callConnector(url, "connections/test", {
    connector: "slack",
    runtime: { kind: "server" },
    connection: { settings: {}, secrets },
  });
}
