import { ACCOUNTS_LIST_ANSWER, ACTION_RUN_ANSWER } from "@broccoli-access/connector-contract";
import { expect, onTestFinished, vi } from "vitest";

import { callConnector, control, linearRequest, memberAccount, test as it } from "#test/support";
import { ACME_LINEAR } from "../seed";

it("discovers the Acme workspace with its Linear key", async ({ connectors: { url } }) => {
  const result = await callConnector(url, "connections/test", {
    ...linearRequest,
    connection: { settings: {}, secrets: { apiKey: "lin_api_acme_fake" } },
  });

  expect(result.body).toEqual({
    details: { organizationName: "Acme", domain: null },
    connection: { settings: ACME_LINEAR.settings },
  });
});

it("lists the seven Linear members and the connection user on one page", async ({
  connectors: { url },
}) => {
  const result = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  const { accounts, nextCursor } = ACCOUNTS_LIST_ANSWER.parse(result.body);

  expect(nextCursor).toBeNull();
  expect(
    accounts
      .toSorted((a, b) => a.values.email.localeCompare(b.values.email))
      .map(({ values }) => [values.email, values.status, values.isConnectionUser]),
  ).toEqual([
    ["admin@acme.example", "active", true],
    ["ana@acme.example", "active", false],
    ["chloe@acme.example", "active", false],
    ["david@acme.example", "active", false],
    ["gabriel@acme.example", "active", false],
    ["hannah@acme.example", "suspended", false],
    ["jun@acme.example", "active", false],
  ]);
});

it("lists the seeded Linear invitation separately from members", async ({
  connectors: { url },
}) => {
  const result = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  const { invitations, accounts } = ACCOUNTS_LIST_ANSWER.parse(result.body);

  expect(invitations).toEqual([seededInvitation]);
  expect(accounts.map(({ values }) => values.email)).not.toContain(seededInvitation.email);
});

it("lists Ivan's new Linear invitation with a 30-day expiry", async ({ connectors: { url } }) => {
  const invitation = {
    email: inviteIvan.account.email,
    invitedAt: "2026-11-24T12:00:00.000Z",
    expiresAt: "2026-12-24T12:00:00.000Z",
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  vi.setSystemTime(new Date(invitation.invitedAt));

  const result = await callConnector(url, "actions/run", inviteIvan);

  expect(result.body).toMatchObject({ changed: true, invitation });
  const list = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  expect(ACCOUNTS_LIST_ANSWER.parse(list.body).invitations).toContainEqual(invitation);
});

it("returns Ivan's same Linear invitation when invited twice", async ({ connectors: { url } }) => {
  const first = await callConnector(url, "actions/run", inviteIvan);
  const { invitation } = ACTION_RUN_ANSWER.parse(first.body);

  const second = await callConnector(url, "actions/run", inviteIvan);

  expect(second.body).toMatchObject({ changed: false, invitation });
  const list = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  const invitations = ACCOUNTS_LIST_ANSWER.parse(list.body).invitations;
  expect(invitations?.filter(({ email }) => email === inviteIvan.account.email)).toEqual([
    invitation,
  ]);
});

it("returns Chloé's active Linear account when invited", async ({ connectors: { url } }) => {
  const { sourceKey, email } = memberAccount(ACME_LINEAR, "chloe@acme.example");
  const values = { email, status: "active", displayName: "Chloé Martin", isConnectionUser: false };

  const result = await callConnector(url, "actions/run", {
    ...linearRequest,
    action: "invite",
    account: { email },
  });

  expect(result.body).toMatchObject({ changed: false, account: { sourceKey, values } });
  const list = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  const { accounts, invitations } = ACCOUNTS_LIST_ANSWER.parse(list.body);
  expect(accounts.find((account) => account.sourceKey === sourceKey)?.values).toEqual(values);
  expect(invitations).toEqual([seededInvitation]);
});

it("returns the seeded Linear invitation when its email is invited", async ({
  connectors: { url },
}) => {
  const result = await callConnector(url, "actions/run", {
    ...linearRequest,
    action: "invite",
    account: { email: seededInvitation.email },
  });

  expect(result.body).toMatchObject({ changed: false, invitation: seededInvitation });
});

it("answers wrong_workspace for an invite to another Linear organisation", async ({
  connectors: { url },
}) => {
  const connection = {
    ...linearRequest.connection,
    settings: { ...ACME_LINEAR.settings, organizationId: "b1db9401-79d2-49f2-9bad-be38636e63aa" },
  };

  const result = await callConnector(url, "actions/run", { ...inviteIvan, connection });

  expect(result.body).toEqual({ error: { code: "wrong_workspace" } });
});

it("answers authentication_failed for another Linear key", async ({ connectors: { url } }) => {
  const result = await callConnector(url, "connections/test", {
    ...linearRequest,
    connection: { settings: {}, secrets: { apiKey: "another-key" } },
  });

  expect(result.body).toEqual({ error: { code: "authentication_failed" } });
});

it("answers authentication_failed for a revoked Linear key", async ({ connectors: { url } }) => {
  await control(url, "/linear/keys/revoke");

  const result = await callConnector(url, "connections/test", linearRequest);

  expect(result.body).toEqual({ error: { code: "authentication_failed" } });
});

const seededInvitation = { email: "new.hire@acme.example", invitedAt: null, expiresAt: null };
const inviteIvan = { ...linearRequest, action: "invite", account: { email: "ivan@acme.example" } };
