import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  SETUP_HOLDER,
  consentAtGoogle,
  googleScanSetup,
  googleSetup,
  googleSignIn,
  storedGoogleAccounts,
  storedUsers,
} from "#test/support";

import { ApplicationError } from "../../../core/applicationError";
import { session } from "../../../core/auth";
import type { Orm } from "../../../core/db";
import { UnknownGoogleAccountError } from "../domain";

test("requests sign-in with the connected Google app without offline access", async ({
  orm,
  fakeGoogle,
}) => {
  await googleScanSetup(orm, fakeGoogle.url);
  const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url });

  const { authorizationUrl, browserToken } = await signIn.startSignIn({
    publicOrigin: "http://localhost:3000",
    now: new Date("2026-11-21T12:00:00Z"),
  });

  const url = new URL(authorizationUrl);
  expect(`${url.origin}${url.pathname}`).toBe(`${fakeGoogle.url}/o/oauth2/v2/auth`);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    client_id: ACME.oauthClient.clientId,
    redirect_uri: "http://localhost:3000/api/google/callback",
    response_type: "code",
  });
  expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("nonce")).toBeTruthy();
  expect(url.searchParams.has("access_type")).toBe(false);
  expect(url.searchParams.has("prompt")).toBe(false);
  expect(browserToken).toEqual(expect.any(String));
});

test("refuses sign-in before Google Workspace is connected", async ({ orm, fakeGoogle }) => {
  const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url });

  await expect(
    signIn.startSignIn({
      publicOrigin: "http://localhost:3000",
      now: new Date("2026-11-21T12:00:00Z"),
    }),
  ).rejects.toMatchObject({ constructor: ApplicationError, code: "CONFLICT" });
});

test("signs the owner's Google account in without changing users or storing tokens", async ({
  orm,
  fakeGoogle,
}) => {
  const { ownerUserId } = await googleScanSetup(orm, fakeGoogle.url);
  const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url });
  const input = {
    publicOrigin: "http://localhost:3000",
    now: new Date("2026-11-21T12:00:00Z"),
  };
  const before = await storedSignInState(orm);
  const { authorizationUrl, browserToken } = await signIn.startSignIn(input);
  const callback = await consentAtGoogle(authorizationUrl, { account: "admin@acme.example" });

  const result = await signIn.finishSignIn({
    ...input,
    browserToken,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });

  expect(result).toEqual({ userId: ownerUserId });
  expect(await storedSignInState(orm)).toEqual(before);
  expect(await storedGoogleAccounts(orm)).toMatchObject([
    {
      userId: ownerUserId,
      providerId: "google",
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    },
  ]);
});

test("refuses a Google account that belongs to no user", async ({ orm, fakeGoogle }) => {
  await googleScanSetup(orm, fakeGoogle.url);
  const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url });
  const input = {
    publicOrigin: "http://localhost:3000",
    now: new Date("2026-11-21T12:00:00Z"),
  };
  const before = await storedSignInState(orm);
  const { authorizationUrl, browserToken } = await signIn.startSignIn(input);
  const callback = await consentAtGoogle(authorizationUrl, { account: "chloe@acme.example" });

  await expect(
    signIn.finishSignIn({
      ...input,
      browserToken,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    }),
  ).rejects.toBeInstanceOf(UnknownGoogleAccountError);

  expect(await storedSignInState(orm)).toEqual(before);
});

test.for([null, "another-browser"])(
  "refuses sign-in state with the browser token %s",
  async (browserToken, { orm, fakeGoogle }) => {
    await googleScanSetup(orm, fakeGoogle.url);
    const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url });
    const input = {
      publicOrigin: "http://localhost:3000",
      now: new Date("2026-11-21T12:00:00Z"),
    };
    const { authorizationUrl } = await signIn.startSignIn(input);
    const callback = await consentAtGoogle(authorizationUrl);

    await expect(
      signIn.finishSignIn({
        ...input,
        browserToken,
        code: callback.searchParams.get("code")!,
        state: callback.searchParams.get("state")!,
      }),
    ).rejects.toMatchObject({ constructor: ApplicationError, code: "INVALID_INPUT" });
  },
);

test("refuses sign-in state older than ten minutes", async ({ orm, fakeGoogle }) => {
  await googleScanSetup(orm, fakeGoogle.url);
  const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url });
  const input = {
    publicOrigin: "http://localhost:3000",
    now: new Date("2026-11-21T12:00:00Z"),
  };
  const { authorizationUrl, browserToken } = await signIn.startSignIn(input);
  const callback = await consentAtGoogle(authorizationUrl);

  await expect(
    signIn.finishSignIn({
      ...input,
      browserToken,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
      now: new Date("2026-11-21T12:10:01Z"),
    }),
  ).rejects.toMatchObject({ constructor: ApplicationError, code: "INVALID_INPUT" });
});

test("refuses setup state as sign-in state", async ({ orm, fakeGoogle }) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const setupCallback = await consentAtGoogle(authorizationUrl);
  const signInCallback = await consentAtGoogle(authorizationUrl);
  await connection.finishConsent(SETUP_HOLDER, {
    ...input,
    code: setupCallback.searchParams.get("code")!,
    state: setupCallback.searchParams.get("state")!,
  });
  const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url });

  await expect(
    signIn.finishSignIn({
      publicOrigin: input.publicOrigin,
      now: input.now,
      browserToken: input.setupToken,
      code: signInCallback.searchParams.get("code")!,
      state: signInCallback.searchParams.get("state")!,
    }),
  ).rejects.toMatchObject({ constructor: ApplicationError, code: "INVALID_INPUT" });
});

async function storedSignInState(orm: Orm) {
  return {
    users: await storedUsers(orm),
    accounts: await storedGoogleAccounts(orm),
    sessions: await orm.select().from(session),
  };
}
