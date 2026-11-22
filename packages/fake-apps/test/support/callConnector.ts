import type { ConnectorCall } from "@broccoli-access/connector-contract";

import { ACME_LINEAR, type SeedWorkspace } from "../../src/seed";

export async function callConnector(url: string, call: ConnectorCall, body: unknown) {
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
