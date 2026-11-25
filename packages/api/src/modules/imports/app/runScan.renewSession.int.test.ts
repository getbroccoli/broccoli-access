import { INTEGRATION_USER_TOTP_SECRET } from "@broccoli-access/fake-apps";

import {
  expect,
  INTEGRATION_USER_EMAIL,
  INTEGRATION_USER_PASSWORD,
  OWNER,
  SYSTEM,
  slackSession,
  storedAppConnections,
  storedImportSources,
  storedRecordHistory,
  suspendIntegrationUserInDirectory,
  test,
} from "#test/support";

test("saves the scan with a new app session when the integration user's session expires", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors);
  const before = await slack.secrets();
  await slack.expire();

  await slack.scans.runScan(SYSTEM, slack.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([{ status: "scanned", failure: null }]);
  expect(await storedAppConnections(orm)).toMatchObject([
    { status: "connected", reconnectCause: null },
  ]);
  const after = await slack.secrets();
  expect(after?.appSession).toBeDefined();
  expect(after?.appSession).not.toEqual(before?.appSession);
  expect(
    (await storedRecordHistory(orm)).filter((line) => line.causeKind === "connector_error"),
  ).toEqual([]);
});

test.for(["blocked_by_check", "permission_missing", "authentication_failed"] as const)(
  "shows %s on the scan and connection when signing in again fails",
  async (code, { orm, seed, fakeConnectors }) => {
    const slack = await slackSession(orm, seed, fakeConnectors);
    await slack.expire();
    await slack.fail("connections/sign-in", code);

    await slack.scans.runScan(SYSTEM, slack.sourceId);

    expect(slack.calls.filter((path) => path === "/v1/connections/sign-in")).toHaveLength(1);
    expect(await storedImportSources(orm)).toMatchObject([
      { status: "scan_failed", failure: code },
    ]);
    expect(await storedAppConnections(orm)).toMatchObject([
      { status: "reconnect", reconnectCause: code },
    ]);
  },
);

test("fails the scan and keeps Slack connected when its renewed session is refused", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors);
  await slack.fail("accounts/list", "authentication_failed", 2);

  await slack.scans.runScan(SYSTEM, slack.sourceId);

  expect(slack.calls.filter((path) => path === "/v1/connections/sign-in")).toHaveLength(1);
  expect(slack.calls.filter((path) => path === "/v1/accounts/list")).toHaveLength(2);
  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "authentication_failed" },
  ]);
  expect(await storedAppConnections(orm)).toMatchObject([
    { status: "connected", reconnectCause: null },
  ]);
  expect(
    (await storedRecordHistory(orm)).filter((line) => line.causeKind === "connector_error"),
  ).toEqual([]);
});

test("keeps the integration user's credentials and Slack session out of a failed scan", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors);
  await slack.expire();
  await slack.fail("connections/sign-in", "blocked_by_check");

  await slack.scans.runScan(SYSTEM, slack.sourceId);

  const answer = await slack.scans.readScan(OWNER, slack.connectionId);
  expect(answer?.failure).toBe("blocked_by_check");
  const shown = JSON.stringify([answer, await storedImportSources(orm)]);
  for (const secret of [
    INTEGRATION_USER_PASSWORD,
    INTEGRATION_USER_TOTP_SECRET,
    "xoxc-",
    "xoxd-",
  ]) {
    expect(shown).not.toContain(secret);
  }
});

test.for([
  { description: "its original email", email: INTEGRATION_USER_EMAIL },
  { description: "a new email", email: "broccoli.renamed@acme.example" },
])(
  "stops the scan before calling the container when Google shows the integration user suspended under $description",
  async ({ email }, { orm, seed, fakeConnectors }) => {
    const slack = await slackSession(orm, seed, fakeConnectors);
    await suspendIntegrationUserInDirectory(orm, seed, email);

    await slack.scans.runScan(SYSTEM, slack.sourceId);

    expect(slack.calls).toEqual([]);
    expect(await slack.scans.readScan(OWNER, slack.connectionId)).toMatchObject({
      status: "scan_failed",
      failure: "authentication_failed",
    });
    expect(await storedAppConnections(orm)).toContainEqual(
      expect.objectContaining({
        id: slack.connectionId,
        status: "reconnect",
        reconnectCause: "authentication_failed",
      }),
    );
  },
);

test("scans with the owner's session when Google shows the integration user suspended", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors, "extension");
  await suspendIntegrationUserInDirectory(orm, seed);

  await slack.scans.runScan(SYSTEM, slack.sourceId);

  expect(await slack.scans.readScan(OWNER, slack.connectionId)).toMatchObject({
    status: "scanned",
    failure: null,
  });
  expect(slack.calls).not.toContain("/v1/connections/sign-in");
});
