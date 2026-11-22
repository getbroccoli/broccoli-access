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
  const appSession = await signInToFakeSlack(url);
  const request = {
    connector: "slack",
    runtime: { kind: "server" },
    connection: { settings: ACME_SLACK.settings, secrets: { appSession } },
  };
  const first = await callConnector(url, "accounts/list", { ...request, cursor: null });
  let page = ACCOUNTS_LIST_ANSWER.parse(first.body);
  expect(page.nextCursor).not.toBeNull();
  const accounts = [...page.accounts];
  const cursors = new Set<string>();
  while (page.nextCursor !== null) {
    expect(cursors.has(page.nextCursor)).toBe(false);
    cursors.add(page.nextCursor);
    const next = await callConnector(url, "accounts/list", { ...request, cursor: page.nextCursor });
    page = ACCOUNTS_LIST_ANSWER.parse(next.body);
    accounts.push(...page.accounts);
  }

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
