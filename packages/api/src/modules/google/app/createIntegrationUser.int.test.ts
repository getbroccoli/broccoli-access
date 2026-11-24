import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  integrationUserTest as test,
  ADMIN,
  consentAnswer,
  CREATION_START as START,
  finishSharedGoogleSetup,
  createdGoogleUsers,
  changeStoredGoogleDomain,
  connectionSecrets,
  refreshGoogleGrant,
  EMPLOYEE,
  GOOGLE_SCOPES,
  googleSignIn,
  integrationUsers,
  OWNER,
  refuseGoogleScope,
  storedAppConnections,
  storedIntegrationUsers,
  storedRecordHistory,
  SYSTEM,
  TEST_SECRET_BOX,
} from "#test/support";

import { createLogger } from "../../../core/logger";
import { createGoogleClient } from "../../../integrations/google";
import {
  EmailTakenError,
  NotSuperAdminError,
  OtherWorkspaceError,
  UserWriteRefusedError,
} from "../domain";

const NON_OWNERS = [
  ["employee", EMPLOYEE],
  ["non-owner admin", ADMIN],
] as const;

test("requires a Google Workspace connection before creation", async ({ orm, fakeGoogle }) => {
  const users = integrationUsers(orm, { googleUrl: fakeGoogle.url });

  await expect(users.startCreation(OWNER, START)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Google Workspace is not connected.",
  });
});

test("asks for incremental offline consent to write users", async ({ workspace, fakeGoogle }) => {
  const { users, owner } = workspace;

  const started = await users.startCreation(owner, START);

  const url = new URL(started.authorizationUrl);
  expect(url.origin).toBe(fakeGoogle.url);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    scope: `openid ${WRITE_SCOPE}`,
    include_granted_scopes: "true",
    access_type: "offline",
    prompt: "consent",
    response_type: "code",
    client_id: ACME.oauthClient.clientId,
    redirect_uri: `${START.publicOrigin}/api/google/callback`,
  });
  expect(started.browserToken).toBeTruthy();
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("nonce")).toBeTruthy();
});

test.for([
  ["   ", "required"],
  ["@acme.example", "invalid"],
  ["bad@@acme.example", "invalid"],
  ["a b@acme.example", "invalid"],
  ["broccoli@sub.acme.example", "invalid"],
  ["broccoli@other.example", "invalid"],
  [`${"a".repeat(65)}@acme.example`, "invalid"],
] as const)("refuses the integration address '%s' as %s", async ([email, code], { workspace }) => {
  const { users, owner } = workspace;
  await expect(users.startCreation(owner, { ...START, email })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "email", code }],
  });
});

test("accepts a 64-character local part", async ({ workspace }) => {
  const email = `${"a".repeat(64)}@acme.example`;
  const started = await workspace.users.startCreation(workspace.owner, { ...START, email });
  expect(started.authorizationUrl).toBeTruthy();
});

test.for(NON_OWNERS)("refuses to start creation for a %s", async ([, caller], { workspace }) => {
  await expect(workspace.users.startCreation(caller, START)).rejects.toMatchObject(FORBIDDEN);
});

test("stores the normalized Google identity and the new offline grant together", async ({
  workspace,
  orm,
  fakeGoogle,
  transact,
}) => {
  const { users, owner, connectionId } = workspace;
  expect(await users.readIntegrationUser(owner)).toBeNull();
  expect(await users.readGoogleUserId(SYSTEM, orm)).toBeNull();
  const [before] = await storedAppConnections(orm);
  const answer = await workspace.allowCreation("  Broccoli@ACME.Example  ");

  await users.finishCreation(owner, answer);

  const rows = await storedIntegrationUsers(orm);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row).toMatchObject({
    id: true,
    email: START.email,
    createdBy: owner.user!.userId,
    createdAt: expect.any(Date) as unknown,
  });
  const signIn = { status: "sign_in_needs_owner", failure: "connectors_container_unavailable" };
  const expectedUser = { id: row.googleUserId, email: START.email, signIn };
  await expect.poll(() => users.readIntegrationUser(owner)).toEqual(expectedUser);
  expect(await transact((tx) => users.readGoogleUserId(SYSTEM, tx))).toBe(row.googleUserId);
  const [after] = await storedAppConnections(orm);
  expect(after!.id).toBe(connectionId);
  expect((after!.settings.grantedScopes as string[]).toSorted()).toEqual(
    [...GOOGLE_SCOPES, WRITE_SCOPE].sort(),
  );
  const secrets = connectionSecrets(after!);
  expect(secrets.clientSecret).toBe(ACME.oauthClient.clientSecret);
  expect(secrets.refreshToken).not.toBe(connectionSecrets(before!).refreshToken);
  const google = createGoogleClient({
    openIdConfigurationUrl: `${fakeGoogle.url}/.well-known/openid-configuration`,
    adminApiUrl: fakeGoogle.url,
  });
  const token = await refreshGoogleGrant(fakeGoogle.url, secrets);
  expect(token.scope.split(" ").sort()).toEqual([...GOOGLE_SCOPES, WRITE_SCOPE].sort());
  expect(await google.findUser(token.access_token, row.googleUserId)).toMatchObject({
    email: START.email,
    givenName: "Broccoli",
    familyName: "Access",
  });
  expect(await createdGoogleUsers(fakeGoogle.url)).toEqual([
    { primaryEmail: START.email, suspended: false, changePasswordAtNextLogin: false },
  ]);
});

test("keeps the generated password encrypted and out of answers, logs and history", async ({
  workspace,
  orm,
  fakeGoogle,
}) => {
  const logs: string[] = [];
  const users = integrationUsers(orm, {
    googleUrl: fakeGoogle.url,
    logger: createLogger("trace", { write: (line) => logs.push(line) }),
  });
  const started = await users.startCreation(workspace.owner, START);

  const finished = await users.finishCreation(workspace.owner, await consentAnswer(started));

  const [row] = await storedIntegrationUsers(orm);
  const plaintext = TEST_SECRET_BOX.decrypt(row!.encryptedSecrets, "integration_user");
  const secrets = JSON.parse(plaintext) as { password: string };
  expect(secrets).toEqual({ password: expect.any(String) as unknown });
  expect(secrets.password.length).toBeGreaterThanOrEqual(32);
  expect(row!.encryptedSecrets).not.toContain(secrets.password);
  expect(finished).toBeUndefined();
  const returned = await users.readIntegrationUser(workspace.owner);
  const escapedPassword = JSON.stringify(secrets.password).slice(1, -1);
  const history = (await storedRecordHistory(orm)).map((row) => ({ ...row, id: String(row.id) }));
  expect(JSON.stringify([started, returned, history])).not.toContain(escapedPassword);
  expect(logs.join("\n")).not.toContain(escapedPassword);
});

test("restricts integration user identity reads to the owner", async ({ workspace }) => {
  const { users } = workspace;
  await expect(users.readIntegrationUser(EMPLOYEE)).rejects.toMatchObject(FORBIDDEN);
});

test("restricts internal Google user id reads to the system", async ({ workspace, orm }) => {
  const { users } = workspace;
  await expect(users.readGoogleUserId(workspace.owner, orm)).rejects.toMatchObject(FORBIDDEN);
});

test.for(NON_OWNERS)("refuses to finish creation for a %s", async ([, caller], { workspace }) => {
  const { users } = workspace;
  const before = await workspace.readState();
  const answer = await workspace.allowCreation();

  await expect(users.finishCreation(caller, answer)).rejects.toMatchObject(FORBIDDEN);
  expect(await workspace.readState()).toEqual(before);
});

test.for([
  ["another browser", { browserToken: "another-browser" }],
  ["a missing browser token", { browserToken: null }],
  ["expired consent", { now: new Date("2027-01-01T12:00:00Z") }],
  ["forged consent", { state: "invalid-state" }],
] as const)(
  "rejects %s without changing the users or grant",
  async ([, override], { workspace }) => {
    const { users, owner } = workspace;
    const before = await workspace.readState();
    const answer = await workspace.allowCreation();

    await expect(users.finishCreation(owner, { ...answer, ...override })).rejects.toMatchObject(
      INVALID_CONSENT,
    );
    expect(await workspace.readState()).toEqual(before);
  },
);

test("rejects a sign-in callback as creation consent", async ({ workspace, orm, fakeGoogle }) => {
  const before = await workspace.readState();
  const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url });
  const answer = await consentAnswer(await signIn.startSignIn(START));

  await expect(workspace.users.finishCreation(workspace.owner, answer)).rejects.toMatchObject(
    INVALID_CONSENT,
  );
  expect(await workspace.readState()).toEqual(before);
});

test("keeps users and grants after refused consent", async ({ workspace, fakeGoogle }) => {
  const { users, owner } = workspace;
  const before = await workspace.readState();
  await refuseGoogleScope(fakeGoogle.url, WRITE_SCOPE);
  const answer = await workspace.allowCreation();

  await expect(users.finishCreation(owner, answer)).rejects.toBeInstanceOf(UserWriteRefusedError);
  expect(await workspace.readState()).toEqual(before);
});

test("refuses consent from an account that is not a super admin", async ({ workspace }) => {
  const { users, owner } = workspace;
  const before = await workspace.readState();
  const answer = await workspace.allowCreation(START.email, "chloe@acme.example");

  await expect(users.finishCreation(owner, answer)).rejects.toBeInstanceOf(NotSuperAdminError);
  expect(await workspace.readState()).toEqual(before);
});

test("refuses consent from a different workspace", async ({ workspace, orm }) => {
  const { users, owner, connectionId } = workspace;
  await changeStoredGoogleDomain(orm, connectionId, "other.example");
  const before = await workspace.readState();
  const answer = await workspace.allowCreation("broccoli@other.example");

  await expect(users.finishCreation(owner, answer)).rejects.toBeInstanceOf(OtherWorkspaceError);
  expect(await workspace.readState()).toEqual(before);
});

test("refuses an email already taken in Google", async ({ workspace }) => {
  const { users, owner } = workspace;
  const before = await workspace.readState();
  const answer = await workspace.allowCreation("ana@acme.example");

  await expect(users.finishCreation(owner, answer)).rejects.toBeInstanceOf(EmailTakenError);
  expect(await workspace.readState()).toEqual(before);
});

test("refuses a second user, including a pending consent", async ({ workspace }) => {
  const { users, owner } = workspace;
  const second = { ...START, email: "second@acme.example" };
  const firstStart = await users.startCreation(owner, START);
  const secondStart = await users.startCreation(owner, second);
  await users.finishCreation(owner, await consentAnswer(firstStart));
  const before = await workspace.readState();

  await expect(users.startCreation(owner, second)).rejects.toMatchObject(ALREADY_EXISTS);
  await expect(users.finishCreation(owner, await consentAnswer(secondStart))).rejects.toMatchObject(
    ALREADY_EXISTS,
  );
  expect(await workspace.readState()).toEqual(before);
  expect(before.created.map(({ primaryEmail }) => primaryEmail)).toEqual([START.email]);
});

test("creates just the winning user when two consents finish together", async ({ workspace }) => {
  const emails = [START.email, "second@acme.example"];
  const answers = await Promise.all(emails.map((email) => workspace.allowCreation(email)));

  const results = await Promise.allSettled(
    answers.map((answer) => workspace.users.finishCreation(workspace.owner, answer)),
  );

  expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  const loser = results.find((result) => result.status === "rejected");
  expect(loser?.reason).toMatchObject({
    code: "CONFLICT",
    message: expect.stringMatching(
      /^The integration user (is being created|already exists)\.$/,
    ) as unknown,
  });
  const winner = emails[results.findIndex((result) => result.status === "fulfilled")];
  const { rows, created } = await workspace.readState();
  expect(rows.map((row) => row.email)).toEqual([winner]);
  expect(created.map((user) => user.primaryEmail)).toEqual([winner]);
});

test("requires the owner's own Google app to start creation", async ({ orm, fakeGoogle }) => {
  await finishSharedGoogleSetup(orm, fakeGoogle.url);
  const users = integrationUsers(orm, { googleUrl: fakeGoogle.url });

  await expect(users.startCreation(OWNER, START)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The integration user needs your own Google app.",
  });
});

test.for([
  [
    "changes the Google app",
    { clientId: "replacement-google-client", clientSecret: "replacement-google-secret" },
  ],
  ["reconnects the same Google app", ACME.oauthClient],
] as const)(
  "refuses outstanding creation consent after the owner %s",
  async ([, client], { workspace }) => {
    const answer = await workspace.allowCreation();
    const refreshToken = await workspace.reconnect(client);

    await expect(workspace.users.finishCreation(workspace.owner, answer)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "The Google app changed during consent. Try again.",
    });
    const { rows, created, connections } = await workspace.readState();
    expect(rows).toEqual([]);
    expect(created).toEqual([]);
    expect(connectionSecrets(connections[0]!).refreshToken === refreshToken).toBe(true);
  },
);

const WRITE_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
const INVALID_CONSENT = {
  code: "INVALID_INPUT",
  message: "The consent expired or was not this browser's.",
};
const FORBIDDEN = { code: "FORBIDDEN" };
const ALREADY_EXISTS = { code: "CONFLICT", message: "The integration user already exists." };
