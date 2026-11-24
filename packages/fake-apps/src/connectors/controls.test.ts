import { ACCOUNTS_LIST_ANSWER } from "@broccoli-access/connector-contract";
import { expect } from "vitest";

import {
  callConnector,
  control,
  linearRequest,
  memberAccount,
  readState,
  test as it,
} from "#test/support";
import { ACME_LINEAR, ACME_SLACK } from "../seed";

it("resets members changed by a connector action and a member control", async ({
  connectors: { url },
}) => {
  const account = memberAccount(ACME_LINEAR, "chloe@acme.example");
  await callConnector(url, "actions/run", { ...linearRequest, action: "suspend", account });
  await control(url, "/slack/members/elif@acme.example/reactivate");
  const changed = await readState(url);
  expect(changed.changes).toEqual({
    slack: [],
    linear: [{ action: "suspend", email: account.email, madeBy: "admin@acme.example" }],
  });
  expect(changed.linear).toContainEqual(
    expect.objectContaining({ email: account.email, status: "suspended" }),
  );
  expect(changed.slack).toContainEqual(
    expect.objectContaining({ email: "elif@acme.example", status: "active" }),
  );

  await control(url, "/reset");

  const reset = await readState(url);
  expect(reset.changes).toEqual({ slack: [], linear: [] });
  expect(reset.linear).toContainEqual(
    expect.objectContaining({ email: account.email, status: "active" }),
  );
  expect(reset.slack).toContainEqual(
    expect.objectContaining({ email: "elif@acme.example", status: "suspended" }),
  );
});

it("shows each workspace's members and their status", async ({ connectors: { url } }) => {
  const state = await readState(url);
  const { slack, linear } = state;
  expect(Object.keys(state).sort()).toEqual(["changes", "invitations", "linear", "slack"]);

  expect(slack).toHaveLength(44);
  expect(linear).toHaveLength(8);
  for (const member of slack)
    expect(member.role).toBe(member.email === "admin@acme.example" ? "admin" : "member");
  for (const member of linear)
    expect(member.role).toBe(member.email === "admin@acme.example" ? "admin" : "user");
  expect(slack).toContainEqual({
    ...memberAccount(ACME_SLACK, "elif@acme.example"),
    displayName: "Elif Demir",
    role: "member",
    status: "suspended",
  });
  expect(linear).toContainEqual({
    ...memberAccount(ACME_LINEAR, "hannah@acme.example"),
    displayName: "Hannah Weber",
    role: "user",
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
  expect(ACCOUNTS_LIST_ANSWER.parse(third.body).accounts).toHaveLength(8);
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

it("shows an invitation added by the control in the next Linear list", async ({
  connectors: { url },
}) => {
  const email = "ivan@acme.example";

  await control(url, "/linear/invitations", { email });

  const list = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  const { invitations } = ACCOUNTS_LIST_ANSWER.parse(list.body);
  expect((await readState(url)).invitations.linear).toContainEqual(
    expect.objectContaining({ email, role: "user" }),
  );
  const invitation = invitations?.find((pending) => pending.email === email);
  expect(invitation?.invitedAt).toEqual(expect.any(String));
  expect(invitation?.expiresAt).toEqual(expect.any(String));
});

it("gives a rejoining Linear member an id that no member has used", async ({
  connectors: { url },
}) => {
  const email = seededInvitation.email;
  await control(url, `/linear/invitations/${email}/accept`);
  const previousIds = (await readState(url)).linear.map(({ sourceKey }) => sourceKey);
  await control(url, `/linear/members/${email}/remove`);
  await control(url, "/linear/invitations", { email });

  await control(url, `/linear/invitations/${email}/accept`);

  const list = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  const { accounts, invitations } = ACCOUNTS_LIST_ANSWER.parse(list.body);
  const accepted = accounts.find(({ values }) => values.email === email);
  expect(accepted?.values.status).toBe("active");
  expect(previousIds).not.toContain(accepted!.sourceKey);
  expect(invitations).toEqual([]);
});

it("removes an expired Linear invitation", async ({ connectors: { url } }) => {
  await control(url, `/linear/invitations/${seededInvitation.email}/expire`);

  const list = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  const { accounts, invitations } = ACCOUNTS_LIST_ANSWER.parse(list.body);
  expect(invitations).toEqual([]);
  expect(accounts.map(({ values }) => values.email)).not.toContain(seededInvitation.email);
});

it.for(["accept", "expire"])(
  "answers 404 for %s without a pending invitation",
  async (action, { connectors: { url } }) => {
    const response = await fetch(`${url}/_fake/linear/invitations/ivan@acme.example/${action}`, {
      method: "POST",
    });

    expect(response.status).toBe(404);
  },
);

it("rejects an invitation control without an email", async ({ connectors: { url } }) => {
  const response = await fetch(`${url}/_fake/linear/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  expect(response.status).toBe(400);
});

it("shows each workspace's pending invitations", async ({ connectors: { url } }) => {
  const { invitations } = await readState(url);

  expect(invitations).toEqual({
    slack: [{ ...seededInvitation, role: "member" }],
    linear: [{ ...seededInvitation, role: "user" }],
  });
});

it("resets a sent invitation and restores an accepted seeded invitation", async ({
  connectors: { url },
}) => {
  const email = "ivan@acme.example";
  await control(url, "/linear/invitations", { email });
  await control(url, `/linear/invitations/${seededInvitation.email}/accept`);
  const changed = await readState(url);
  expect(changed.invitations.linear.map((invitation) => invitation.email)).toEqual([email]);

  await control(url, "/reset");

  const reset = await readState(url);
  expect(reset.invitations.linear).toEqual([{ ...seededInvitation, role: "user" }]);
  expect(reset.linear).not.toContainEqual(
    expect.objectContaining({ email: seededInvitation.email }),
  );
});

it("removes a member through the control without recording an action", async ({
  connectors: { url },
}) => {
  await control(url, "/linear/members/chloe@acme.example/remove");

  const state = await readState(url);
  expect(state.linear.map(({ email }) => email)).not.toContain("chloe@acme.example");
  expect(state.changes.linear).toEqual([]);
});

it("changes a member's role through the control", async ({ connectors: { url } }) => {
  await control(url, "/linear/members/chloe@acme.example/role", { role: "admin" });

  expect((await readState(url)).linear).toContainEqual(
    expect.objectContaining({ email: "chloe@acme.example", role: "admin" }),
  );
});

it.for([
  { path: "unknown/members/chloe@acme.example/remove", status: 404, body: {} },
  { path: "linear/members/missing@acme.example/remove", status: 404, body: {} },
  { path: "linear/members/missing@acme.example/role", status: 404, body: { role: "admin" } },
  { path: "linear/members/chloe@acme.example/role", status: 400, body: { role: "unlisted" } },
])("answers $status for $path", async ({ path, status, body }, { connectors: { url } }) => {
  const response = await fetch(`${url}/_fake/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(status);
});

const seededInvitation = { email: "new.hire@acme.example", invitedAt: null, expiresAt: null };
