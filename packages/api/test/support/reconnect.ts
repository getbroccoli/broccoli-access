import assert from "node:assert/strict";

import type { RunningFakeConnectors } from "@broccoli-access/fake-apps";

import type { Orm } from "../../src/core/db";
import { ownerHandOver } from "./containerConnections";
import { storedImportSources } from "./storedScan";
import { OWNER, SYSTEM } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";

/** Posts a control to this test's fake app. */
export async function postFakeControl(url: string, path: string) {
  const response = await fetch(new URL(`/_fake/${path}`, url), { method: "POST" });
  assert.equal(response.status, 204);
}

/** Connects Slack, completes its first scan and queues another after expiring its session. */
export async function slackWithExpiredSession(
  orm: Orm,
  seed: TestSeed,
  fake: RunningFakeConnectors,
) {
  const owner = OWNER.user!;
  await seed.user({ id: owner.userId, email: owner.email });
  const { service, handOver, scans } = await ownerHandOver(orm, fake);
  const saved = await service.connect(OWNER, {
    connector: "slack",
    appSession: handOver.appSession,
    noticeAccepted: true,
  });
  const connectionId = saved.connection!.id;
  const sourceId = (await storedImportSources(orm)).find(
    (row) => row.connectionId === connectionId,
  )!.id;
  await scans.runScan(SYSTEM, sourceId);
  await postFakeControl(fake.url, "slack/sessions/expire");
  await scans.scanNow(OWNER, connectionId);
  return { service, scans, connectionId, sourceId };
}
