import { ACCOUNTS_LIST_ANSWER } from "@broccoli-access/connector-contract";
import { expect } from "vitest";

import { callConnector, control, linearRequest, memberAccount, test as it } from "#test/support";
import { ACME_LINEAR, ACME_SLACK } from "../seed";

it("resets members changed by a connector action and a member control", async ({
  connectors: { url },
}) => {
  const account = memberAccount(ACME_LINEAR, "chloe@acme.example");
  await callConnector(url, "actions/run", { ...linearRequest, action: "suspend", account });
  await control(url, "/slack/members/elif@acme.example/reactivate");
  const changed = await readState(url);
  expect(changed.linear).toContainEqual(
    expect.objectContaining({ email: account.email, status: "suspended" }),
  );
  expect(changed.slack).toContainEqual(
    expect.objectContaining({ email: "elif@acme.example", status: "active" }),
  );

  await control(url, "/reset");

  const reset = await readState(url);
  expect(reset.linear).toContainEqual(
    expect.objectContaining({ email: account.email, status: "active" }),
  );
  expect(reset.slack).toContainEqual(
    expect.objectContaining({ email: "elif@acme.example", status: "suspended" }),
  );
});

it("shows each workspace's members and their status", async ({ connectors: { url } }) => {
  const { slack, linear } = await readState(url);

  expect(slack).toHaveLength(41);
  expect(linear).toHaveLength(7);
  expect(slack).toContainEqual({
    ...memberAccount(ACME_SLACK, "elif@acme.example"),
    displayName: "Elif Demir",
    status: "suspended",
  });
  expect(linear).toContainEqual({
    ...memberAccount(ACME_LINEAR, "hannah@acme.example"),
    displayName: "Hannah Weber",
    status: "suspended",
  });
});

it.for([
  ["chloe@acme.example", "suspend", "suspended"],
  ["hannah@acme.example", "reactivate", "active"],
])(
  "shows the member control for %s (%s) in the next list",
  async ([email, action, status], { connectors: { url } }) => {
    await control(url, `/linear/members/${email}/${action}`);

    const result = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });

    const member = ACCOUNTS_LIST_ANSWER.parse(result.body).accounts.find(
      ({ values }) => values.email === email,
    );
    expect(member?.values.status).toBe(status);
  },
);

it("answers 404 for a member control with an unknown email", async ({ connectors: { url } }) => {
  const response = await fetch(`${url}/_fake/linear/members/missing@acme.example/suspend`, {
    method: "POST",
  });

  expect(response.status).toBe(404);
});

it("fails only the next two matching Linear lists", async ({ connectors: { url } }) => {
  await control(url, "/failures", {
    connector: "linear",
    call: "accounts/list",
    code: "rate_limited",
    count: 2,
  });
  const request = { ...linearRequest, cursor: null };

  const first = await callConnector(url, "accounts/list", request);
  const connection = await callConnector(url, "connections/test", linearRequest);
  const second = await callConnector(url, "accounts/list", request);
  const third = await callConnector(url, "accounts/list", request);

  expect(first.body).toEqual({ error: { code: "rate_limited" } });
  expect(connection.body).toMatchObject({ details: { organizationName: "Acme" } });
  expect(second.body).toEqual({ error: { code: "rate_limited" } });
  expect(ACCOUNTS_LIST_ANSWER.parse(third.body).accounts).toHaveLength(7);
});

it("rejects a failure with an unknown code", async ({ connectors: { url } }) => {
  const response = await fetch(`${url}/_fake/failures`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connector: "linear", call: "accounts/list", code: "timeout", count: 1 }),
  });

  expect(response.status).toBe(400);
});

it("delays a connector answer by the configured duration", async ({ connectors: { url } }) => {
  await control(url, "/delay", { milliseconds: 200 });

  const start = performance.now();
  const result = await callConnector(url, "connections/test", linearRequest);
  const elapsed = performance.now() - start;

  expect(result.body).toMatchObject({ details: { organizationName: "Acme" } });
  expect(elapsed).toBeGreaterThanOrEqual(195);
});

it("refuses a member control with an Origin header and preserves the member", async ({
  connectors: { url },
}) => {
  const response = await fetch(`${url}/_fake/linear/members/chloe@acme.example/suspend`, {
    method: "POST",
    headers: { Origin: url },
  });

  expect(response.status).toBe(403);
  const state = await readState(url);
  expect(state.linear).toContainEqual(
    expect.objectContaining({ email: "chloe@acme.example", status: "active" }),
  );
});

async function readState(url: string) {
  const response = await fetch(`${url}/_fake/state`);
  return response.json() as Promise<{ slack: unknown[]; linear: unknown[] }>;
}
