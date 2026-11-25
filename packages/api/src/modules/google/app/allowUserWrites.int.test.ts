import {
  ADMIN,
  consentAnswer,
  connectionSecrets,
  CREATION_START,
  expect,
  GOOGLE_SCOPES,
  integrationUserTest as test,
  refreshGoogleGrant,
  refuseGoogleScope,
  storedAppConnections,
  userWriteConsent,
} from "#test/support";
import { UserWriteRefusedError } from "../domain";

test("asks for the write scope incrementally and saves the grown grant before returning the owner", async ({
  workspace: { owner },
  orm,
  fakeGoogle,
}) => {
  const service = userWriteConsent(orm, { googleUrl: fakeGoogle.url });
  const [before] = await storedAppConnections(orm);
  const started = await service.start(owner, START);
  const query = new URL(started.authorizationUrl).searchParams;
  expect(query.get("scope")?.split(" ").sort()).toEqual([WRITE_SCOPE, "openid"]);
  expect(query.get("include_granted_scopes")).toBe("true");

  const answer = await consentAnswer(started);
  expect(service.readReturnTo(answer)).toBe(START.returnTo);
  await expect(service.finish(owner, answer)).resolves.toEqual({ returnTo: START.returnTo });

  const [after] = await storedAppConnections(orm);
  const scopes = [...GOOGLE_SCOPES, WRITE_SCOPE].sort();
  expect((after!.settings.grantedScopes as string[]).toSorted()).toEqual(scopes);
  const secrets = connectionSecrets(after!);
  expect(secrets.refreshToken).not.toBe(connectionSecrets(before!).refreshToken);
  const token = await refreshGoogleGrant(fakeGoogle.url, secrets);
  expect(token.scope.split(" ").sort()).toEqual(scopes);
});

test("preserves the stored connection when the owner refuses the write scope", async ({
  workspace: { owner },
  orm,
  fakeGoogle,
}) => {
  const service = userWriteConsent(orm, { googleUrl: fakeGoogle.url });
  const before = await storedAppConnections(orm);
  await refuseGoogleScope(fakeGoogle.url, WRITE_SCOPE);
  const answer = await consentAnswer(await service.start(owner, START));

  await expect(service.finish(owner, answer)).rejects.toBeInstanceOf(UserWriteRefusedError);
  expect(await storedAppConnections(orm)).toEqual(before);
});

test("rejects a return path pointing outside the instance", async ({
  workspace: { owner },
  orm,
  fakeGoogle,
}) => {
  const service = userWriteConsent(orm, { googleUrl: fakeGoogle.url });

  await expect(
    service.start(owner, { ...START, returnTo: "//external.acme.example/people" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "returnTo", code: "invalid" }],
  });
});

test("requires the owner to start write consent", async ({ orm, fakeGoogle }) => {
  const service = userWriteConsent(orm, { googleUrl: fakeGoogle.url });

  await expect(service.start(ADMIN, START)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

const WRITE_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
const START = {
  publicOrigin: CREATION_START.publicOrigin,
  now: CREATION_START.now,
  returnTo: "/people?tab=active",
};
