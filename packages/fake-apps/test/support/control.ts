import type { AccountAction, Invitation } from "@broccoli-access/connector-contract";
import { expect } from "vitest";

export async function control(
  url: string,
  path: string,
  body: Record<string, unknown> = {},
  method = "POST",
): Promise<void> {
  const response = await fetch(`${url}/_fake${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
}

type Workspace = "slack" | "linear";

interface MemberState {
  sourceKey: string;
  email: string;
  displayName: string;
  status: "active" | "suspended";
  role: string;
}

export async function readState(url: string) {
  const response = await fetch(`${url}/_fake/state`);
  expect(response.status).toBe(200);
  return response.json() as Promise<
    Record<Workspace, MemberState[]> & {
      invitations: Record<Workspace, (Invitation & { role: string })[]>;
      changes: Record<Workspace, { action: AccountAction; email: string; madeBy: string }[]>;
    }
  >;
}
