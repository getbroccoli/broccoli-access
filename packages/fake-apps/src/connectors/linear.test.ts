import { ACCOUNTS_LIST_ANSWER } from "@broccoli-access/connector-contract";
import { expect } from "vitest";

import { callConnector, control, linearRequest, test as it } from "#test/support";
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
