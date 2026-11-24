import {
  ACCOUNTS_LIST_ANSWER,
  type Connection,
  type ConnectorCall,
  type IntegrationUserCall,
} from "@broccoli-access/connector-contract";

import { expect } from "vitest";

import { ACME_LINEAR, type SeedWorkspace } from "../../src/seed";

export async function callConnector(
  url: string,
  call: ConnectorCall | IntegrationUserCall,
  body: unknown,
) {
  const response = await fetch(`${url}/v1/${call}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: response.ok ? await response.json() : undefined,
  };
}

export const linearRequest = {
  connector: "linear",
  runtime: { kind: "server" },
  connection: { settings: ACME_LINEAR.settings, secrets: { apiKey: ACME_LINEAR.apiKey } },
} as const;

export function memberAccount(workspace: SeedWorkspace, email: string) {
  const member = workspace.members.find((candidate) => candidate.email === email);
  if (!member) throw new Error(`Missing seeded member ${email}`);
  return { sourceKey: member.sourceKey, email: member.email };
}

export async function listSlackPages(url: string, connection: Connection) {
  const request = { connector: "slack", runtime: { kind: "server" }, connection };
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
