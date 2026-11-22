import assert from "node:assert/strict";

import type { ConnectorErrorCode } from "../../src/core/connectors";

/** Plans failures on the fake's HTTP boundary. */
export async function failFakeGoogle(
  googleUrl: string,
  failure: { endpoint: string; error: ConnectorErrorCode; count: number },
): Promise<void> {
  const response = await fetch(`${googleUrl}/_fake/failures`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(failure),
  });
  assert.equal(response.status, 204);
}

export async function suspendAtFakeGoogle(googleUrl: string, email: string): Promise<void> {
  const response = await fetch(`${googleUrl}/_fake/users/${encodeURIComponent(email)}/suspend`, {
    method: "POST",
  });
  assert.equal(response.status, 204);
}
