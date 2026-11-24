import { INTEGRATION_USER_TOTP_SECRET } from "@broccoli-access/fake-apps";
import express from "express";

import {
  ADMIN,
  CREATION_START,
  EMPLOYEE,
  TEST_SECRET_BOX,
  expect,
  failIntegrationUserSetup,
  integrationUsers,
  integrationUserTest as test,
  postFakeControl,
  serveConnectorRoutes,
  storedIntegrationUsers,
  storedRecordHistory,
} from "#test/support";

import type { Orm } from "../../../core/db";
import { createLogger } from "../../../core/logger";

test("creation sets up two-step sign-in and stores its secret encrypted with the password", async ({
  signInWorkspace: workspace,
  orm,
}) => {
  await workspace.createUser();

  await expect.poll(workspace.readSignIn).toEqual(READY);
  expect(await storedSecrets(orm)).toEqual({
    password: expect.any(String) as unknown,
    totpSecret: INTEGRATION_USER_TOTP_SECRET,
  });
});

test("creation returns while two-step sign-in is being set up", async ({
  signInWorkspace: workspace,
  fakeConnectors,
}) => {
  await postFakeControl(fakeConnectors.url, "delay", { milliseconds: 750 });

  await workspace.createUser();

  expect(await workspace.readSignIn()).toEqual(SETTING_UP);
  await postFakeControl(fakeConnectors.url, "delay", { milliseconds: 0 });
  await expect.poll(workspace.readSignIn, { timeout: 5_000 }).toEqual(READY);
});

test("the owner can retry a Google check with the original password", async ({
  signInWorkspace: workspace,
  fakeConnectors,
  orm,
}) => {
  await failIntegrationUserSetup(fakeConnectors.url, "blocked_by_check");
  await workspace.createUser();
  await expect.poll(workspace.readSignIn).toEqual(BLOCKED);
  const before = await storedSecrets(orm);
  expect(before).toEqual({ password: expect.any(String) as unknown });

  await workspace.users.startSignIn(workspace.owner);

  await expect.poll(workspace.readSignIn).toEqual(READY);
  expect(await storedSecrets(orm)).toEqual({ ...before, totpSecret: INTEGRATION_USER_TOTP_SECRET });
});

test.for([
  ["authentication_failed", "authentication_failed"],
  ["app_unavailable", "connectors_container_unavailable"],
  ["unexpected_response", "setup_did_not_finish"],
] as const)(
  "reports %s to the owner as %s",
  async ([error, failure], { signInWorkspace: workspace, fakeConnectors }) => {
    await failIntegrationUserSetup(fakeConnectors.url, error);

    await workspace.createUser();

    await expect.poll(workspace.readSignIn).toEqual({ status: "sign_in_needs_owner", failure });
  },
);

test("a restart without a stored two-step secret reports unfinished setup", async ({
  signInWorkspace: workspace,
  fakeConnectors,
  fakeGoogle,
  orm,
}) => {
  await failIntegrationUserSetup(fakeConnectors.url, "blocked_by_check");
  await workspace.createUser();
  await expect.poll(workspace.readSignIn).toEqual(BLOCKED);

  const restarted = integrationUsers(orm, {
    googleUrl: fakeGoogle.url,
    connectorsUrl: fakeConnectors.url,
  });

  expect((await restarted.readIntegrationUser(workspace.owner))?.signIn).toEqual({
    status: "sign_in_needs_owner",
    failure: "setup_did_not_finish",
  });
});

test("a second setup sends the stored password and two-step secret", async ({
  signInWorkspace: workspace,
  fakeGoogle,
  fakeConnectors,
  orm,
}) => {
  await workspace.createUser();
  await expect.poll(workspace.readSignIn).toEqual(READY);
  const secrets = await storedSecrets(orm);
  const requests: unknown[] = [];
  const rotatedSecret = "JBSWY3DPEHPK3PXQ";
  const app = express().post("/v1/integration-user/setup", express.json(), (request, response) => {
    requests.push(request.body);
    response.json({ totpSecret: rotatedSecret });
  });
  const container = await serveConnectorRoutes(fakeConnectors.url, app);
  const restarted = integrationUsers(orm, {
    googleUrl: fakeGoogle.url,
    connectorsUrl: container.url,
  });

  await restarted.startSignIn(workspace.owner);

  expect((await restarted.readIntegrationUser(workspace.owner))?.signIn).toEqual(READY);
  await expect.poll(async () => (await storedSecrets(orm)).totpSecret).toBe(rotatedSecret);
  expect(requests).toEqual([{ integrationUser: { email: CREATION_START.email, ...secrets } }]);
});

test("two simultaneous retries start one sign-in attempt", async ({
  workspace,
  fakeGoogle,
  fakeConnectors,
  orm,
}) => {
  await workspace.createUser();
  await expect.poll(workspace.readSignIn).toEqual(UNAVAILABLE);
  let attempts = 0;
  const app = express().post("/v1/integration-user/setup", (_request, _response, next) => {
    attempts++;
    next();
  });
  const container = await serveConnectorRoutes(fakeConnectors.url, app);
  const users = integrationUsers(orm, { googleUrl: fakeGoogle.url, connectorsUrl: container.url });
  await failIntegrationUserSetup(fakeConnectors.url, "blocked_by_check");
  await postFakeControl(fakeConnectors.url, "delay", { milliseconds: 500 });

  await Promise.all([users.startSignIn(workspace.owner), users.startSignIn(workspace.owner)]);

  const read = async () => (await users.readIntegrationUser(workspace.owner))?.signIn;
  expect(await read()).toEqual(SETTING_UP);
  await expect.poll(read, { timeout: 5_000 }).toEqual(BLOCKED);
  expect(attempts).toBe(1);
});

test.for([
  ["employee", EMPLOYEE],
  ["non-owner admin", ADMIN],
] as const)("refuses sign-in for the %s", async ([, caller], { workspace }) => {
  await workspace.createUser();
  await expect.poll(workspace.readSignIn).toEqual(UNAVAILABLE);

  await expect(workspace.users.startSignIn(caller)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("refuses the owner's sign-in attempt before the integration user exists", async ({
  workspace,
}) => {
  await expect(workspace.users.startSignIn(workspace.owner)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The integration user does not exist.",
  });
});

test("keeps sign-in secrets out of answers, logs and history across a failure and a retry", async ({
  workspace,
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const logs: string[] = [];
  const users = integrationUsers(orm, {
    googleUrl: fakeGoogle.url,
    connectorsUrl: fakeConnectors.url,
    logger: createLogger("trace", { write: (line) => logs.push(line) }),
  });
  const read = () => users.readIntegrationUser(workspace.owner);
  await failIntegrationUserSetup(fakeConnectors.url, "blocked_by_check");
  await users.finishCreation(workspace.owner, await workspace.allowCreation());
  await expect.poll(read).toMatchObject({ signIn: BLOCKED });
  const failed = await read();

  await users.startSignIn(workspace.owner);
  await expect.poll(read).toMatchObject({ signIn: READY });

  const history = (await storedRecordHistory(orm)).map((row) => ({ ...row, id: String(row.id) }));
  const answersAndHistory = JSON.stringify([failed, await read(), history]);
  const { password } = await storedSecrets(orm);
  for (const secret of [password, INTEGRATION_USER_TOTP_SECRET]) {
    expect(answersAndHistory).not.toContain(secret);
    expect(logs.join("\n")).not.toContain(secret);
  }
});

const READY = { status: "signs_in_with_two_step_sign_in", failure: null };
const SETTING_UP = { status: "setting_up_two_step_sign_in", failure: null };
const BLOCKED = { status: "sign_in_needs_owner", failure: "blocked_by_check" };
const UNAVAILABLE = { status: "sign_in_needs_owner", failure: "connectors_container_unavailable" };

async function storedSecrets(orm: Orm) {
  const [row] = await storedIntegrationUsers(orm);
  return JSON.parse(TEST_SECRET_BOX.decrypt(row!.encryptedSecrets, "integration_user")) as {
    password: string;
    totpSecret?: string;
  };
}
