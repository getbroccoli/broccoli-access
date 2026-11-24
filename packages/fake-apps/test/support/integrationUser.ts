import type { IntegrationUser } from "@broccoli-access/connector-contract";
import { expect } from "vitest";

import { INTEGRATION_USER_TOTP_SECRET } from "../../src/seed";
import { callConnector } from "./callConnector";
import { slackOwnerRequest } from "./signInToFakeSlack";

export const integrationUser = {
  email: "broccoli@acme.example",
  password: "demo-password",
  totpSecret: INTEGRATION_USER_TOTP_SECRET,
} satisfies IntegrationUser;

export async function inviteSlackAdmin(url: string) {
  const result = await callConnector(url, "actions/run", {
    ...(await slackOwnerRequest(url)),
    action: "invite",
    account: { email: integrationUser.email, role: "admin" },
  });
  expect(result.body).toMatchObject({
    changed: true,
    invitation: { email: integrationUser.email },
  });
}
