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

export async function grantAtFakeGoogle(
  googleUrl: string,
  grant: { email: string; clientId: string; appName: string; grantedAt?: string },
): Promise<void> {
  const response = await fetch(`${googleUrl}/_fake/grants`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(grant),
  });
  assert.equal(response.status, 204);
}

export async function revokeAtFakeGoogle(
  googleUrl: string,
  grant: { email: string; clientId: string },
): Promise<void> {
  const response = await fetch(`${googleUrl}/_fake/grants`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(grant),
  });
  assert.equal(response.status, 204);
}

export async function refuseGoogleScope(googleUrl: string, scope: string) {
  const response = await fetch(`${googleUrl}/_fake/consent/refuse-scope`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  assert.equal(response.status, 204);
}

export async function createdGoogleUsers(googleUrl: string) {
  const response = await fetch(`${googleUrl}/_fake/state`);
  assert.equal(response.status, 200);
  const state = (await response.json()) as {
    createdUsers: {
      primaryEmail: string;
      suspended: boolean;
      changePasswordAtNextLogin: boolean;
    }[];
  };
  return state.createdUsers;
}
