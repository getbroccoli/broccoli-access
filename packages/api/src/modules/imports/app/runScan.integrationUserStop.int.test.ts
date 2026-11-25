import type { RunningFakeConnectors } from "@broccoli-access/fake-apps";

import {
  consentAnswer,
  CREATION_START,
  expect,
  googleScanSetup,
  integrationUsers,
  postFakeControl,
  scans,
  slackSession,
  slackSessionForOwner,
  storedRecordHistory,
  suspendAtFakeGoogle,
  SYSTEM,
  test,
} from "#test/support";
import type { Orm } from "../../../core/db";

test("a directory suspension stops Slack and fails its running change without calling Slack", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { directory, slack } = await connectSlackAndDirectory(orm, fakeGoogle.url, fakeConnectors);
  const disable = await slack.queueDisable();
  slack.calls.length = 0;

  await directory.scanSuspended();

  expect(slack.calls).toEqual([]);
  expect(await slack.readConnection()).toMatchObject({
    status: "reconnect",
    reconnectCause: "authentication_failed",
  });
  expect(await disable.latest()).toMatchObject({
    status: "failed",
    error: "authentication_failed",
  });
  expect(await connectionHistory(orm, slack.connectionId)).toContainEqual(
    expect.objectContaining({ causeKind: "connector_error", causeRef: directory.sourceId }),
  );
});

test("the next active directory scan reconnects Slack and its next scan succeeds", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { directory, slack } = await connectSlackAndDirectory(orm, fakeGoogle.url, fakeConnectors);
  await directory.scanSuspended();

  await directory.scanActive();

  expect(slack.calls).toEqual([]);
  expect(await slack.readConnection()).toMatchObject({ status: "connected", reconnectCause: null });
  expect(
    (await connectionHistory(orm, slack.connectionId)).flatMap((line) => line.changes),
  ).toEqual(
    expect.arrayContaining([
      { field: "status", oldValue: "connected", newValue: "reconnect" },
      { field: "status", oldValue: "reconnect", newValue: "connected" },
    ]),
  );
  await slack.scans.runScan(SYSTEM, slack.sourceId);
  expect(await slack.scans.readScan(directory.owner, slack.connectionId)).toMatchObject({
    status: "scanned",
    failure: null,
  });
});

test("suspended and active directory scans preserve a Slack reconnect caused by a blocked sign-in", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { directory, slack } = await connectSlackAndDirectory(orm, fakeGoogle.url, fakeConnectors);
  await slack.expire();
  await slack.fail("connections/sign-in", "blocked_by_check");
  await slack.scans.runScan(SYSTEM, slack.sourceId);
  const blocked = { status: "reconnect", reconnectCause: "blocked_by_check" };
  expect(await slack.readConnection()).toMatchObject(blocked);
  const before = await connectionHistory(orm, slack.connectionId);

  await directory.scanSuspended();
  expect(await slack.readConnection()).toMatchObject(blocked);
  await directory.scanActive();
  expect(await slack.readConnection()).toMatchObject(blocked);
  expect(await connectionHistory(orm, slack.connectionId)).toEqual(before);
});

test("suspended and active directory scans leave the owner's extension connection alone", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { directory, slack } = await connectSlackAndDirectory(
    orm,
    fakeGoogle.url,
    fakeConnectors,
    "extension",
  );
  const before = await slack.readConnection();
  const history = await connectionHistory(orm, slack.connectionId);

  await directory.scanSuspended();
  expect(await slack.readConnection()).toEqual(before);
  await directory.scanActive();
  expect(await slack.readConnection()).toEqual(before);
  expect(await connectionHistory(orm, slack.connectionId)).toEqual(history);
  expect(slack.calls).toEqual([]);
});

test("a directory scan missing the integration user leaves its Slack connection alone", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  const google = await googleScanSetup(orm, fakeGoogle.url);
  const slack = await slackSession(orm, seed, fakeConnectors);
  const before = await slack.readConnection();
  const history = await connectionHistory(orm, slack.connectionId);

  await google.scans.runScan(SYSTEM, google.sourceId);

  expect(await google.scans.readScan(google.owner, google.connectionId)).toMatchObject({
    status: "scanned",
  });
  expect(await slack.readConnection()).toEqual(before);
  expect(await connectionHistory(orm, slack.connectionId)).toEqual(history);
  expect(slack.calls).toEqual([]);
});

async function connectSlackAndDirectory(
  orm: Orm,
  googleUrl: string,
  fake: RunningFakeConnectors,
  sessionFrom: "server_sign_in" | "extension" = "server_sign_in",
) {
  const { owner, sourceId, connectionId } = await googleScanSetup(orm, googleUrl);
  const users = integrationUsers(orm, { googleUrl, connectorsUrl: fake.url });
  await users.finishCreation(
    owner,
    await consentAnswer(await users.startCreation(owner, CREATION_START)),
  );
  await expect
    .poll(() => users.readIntegrationUser(owner))
    .toMatchObject({ signIn: { status: "signs_in_with_two_step_sign_in" } });
  const slack = await slackSessionForOwner(orm, fake, owner, sessionFrom);
  const google = scans(orm, { googleUrl, renewals: slack.renewals });
  async function runDirectoryScan() {
    await google.scanNow(owner, connectionId);
    await google.runScan(SYSTEM, sourceId);
    expect(await google.readScan(owner, connectionId)).toMatchObject({ status: "scanned" });
  }
  return {
    slack,
    directory: {
      owner,
      sourceId,
      async scanSuspended() {
        await suspendAtFakeGoogle(googleUrl, CREATION_START.email);
        await runDirectoryScan();
      },
      async scanActive() {
        await postFakeControl(googleUrl, `users/${CREATION_START.email}/unsuspend`);
        await runDirectoryScan();
      },
    },
  };
}

async function connectionHistory(orm: Orm, connectionId: string) {
  return (await storedRecordHistory(orm)).filter(
    (line) => line.recordType === "app_connection" && line.recordId === connectionId,
  );
}
