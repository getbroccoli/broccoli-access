import assert from "node:assert/strict";

import {
  INTEGRATION_USER_TOTP_SECRET,
  type RunningFakeConnectors,
} from "@broccoli-access/fake-apps";

import type { Orm } from "../../src/core/db";
import { containerConnections } from "./containerConnections";
import { signInToFakeSlack } from "./signInToFakeSlack";
import { OWNER } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";

export const INTEGRATION_USER_EMAIL = "broccoli@acme.example";

/** The owner and an integration user whose two-step sign-in is set up, with the connect services. */
export async function readyIntegrationUser(
  orm: Orm,
  seed: TestSeed,
  fake: RunningFakeConnectors,
  now?: () => Date,
) {
  await seedReadyIntegrationUser(seed);
  return containerConnections(orm, fake.url, undefined, now);
}

export async function seedReadyIntegrationUser(seed: TestSeed) {
  const owner = OWNER.user!;
  await seed.user({ id: owner.userId, email: owner.email });
  await seed.integrationUser({
    email: INTEGRATION_USER_EMAIL,
    googleUserId: "118204455667788990011",
    createdBy: owner.userId,
    totpSecret: INTEGRATION_USER_TOTP_SECRET,
  });
}

/** Signs in as the integration user and confirms the Slack workspace it reached. */
export async function connectAsIntegrationUser(
  service: ReturnType<typeof containerConnections>["service"],
  ctx = OWNER,
) {
  const input = { connector: "slack", noticeAccepted: true };
  const { handOver } = await service.connectWithIntegrationUser(ctx, input);
  assert.ok(handOver, "Expected a workspace to confirm");
  return service.connect(ctx, { ...input, appSession: handOver.appSession });
}

/** Invites the integration user to the fake Slack as its admin Mia would; no `role` is the default one. */
export async function inviteIntegrationUserToFakeSlack(
  fake: RunningFakeConnectors,
  role?: "admin",
) {
  const response = await fetch(new URL("/v1/actions/run", fake.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      connector: "slack",
      runtime: { kind: "server" },
      connection: { settings: {}, secrets: { appSession: await signInToFakeSlack(fake) } },
      action: "invite",
      account: { email: INTEGRATION_USER_EMAIL, role },
    }),
  });
  assert.equal(response.status, 200);
  assert.ok(!("error" in ((await response.json()) as object)));
}
