import { onTestFinished, vi } from "vitest";

import {
  expect,
  test,
  SETUP_HOLDER,
  GOOGLE_RELAY_URL,
  RELAY_HANDLE,
  startSharedGoogleSetup,
  googleRelayGrant,
  stubGoogleRelay,
  assertRelayRedemption,
  googleSignIn,
  storedGoogleAccounts,
  storedUsers,
  storedAppConnections,
} from "#test/support";

import { ApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";

test("shared sign-in redeems the owner's identity without storing sign-in tokens", async ({
  orm,
  fakeGoogle,
}) => {
  const { setup, signIn, owner, authorization, input, relay } = await startOwnerSignIn(
    orm,
    fakeGoogle.url,
  );
  expect(authorization.origin + authorization.pathname).toBe(
    GOOGLE_RELAY_URL + "/google/authorize",
  );
  expect(authorization.searchParams.get("return_to")).toBe(
    setup.input.publicOrigin + "/api/google/callback",
  );
  expect(authorization.searchParams.get("purpose")).toBe("sign_in");
  expect(input.state).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
  const [before] = await storedAppConnections(orm);
  const grant = await googleRelayGrant(fakeGoogle.url, authorization);
  relay.redeem.mockReturnValueOnce(Response.json(grant));

  expect(await signIn.finishSignIn(input)).toEqual(owner);

  await assertRelayRedemption(relay.requests.at(-1)!, authorization);
  expect(await storedUsers(orm)).toMatchObject([{ id: owner.userId }]);
  expect(await storedGoogleAccounts(orm)).toMatchObject([
    { userId: owner.userId, accessToken: null, refreshToken: null, idToken: null },
  ]);
  expect(await storedAppConnections(orm)).toEqual([before]);
});

test("public shared sign-in requires a saved address before any outbound request", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const { signIn, input } = await startOwnerSignIn(orm, fakeGoogle.url);
  await seed.clearPublicOrigin();
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockClear()
    .mockRejectedValue(new Error("Unexpected HTTP request"));
  onTestFinished(() => network.mockRestore());

  await expect(signIn.startSignIn(input)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  await expect(signIn.finishSignIn(input)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(network).not.toHaveBeenCalled();
});

test("a relay refusal for a different handoff destination refuses sign-in", async ({
  orm,
  fakeGoogle,
}) => {
  const { signIn, input, relay, authorization } = await startOwnerSignIn(orm, fakeGoogle.url);
  relay.redeem.mockReturnValueOnce(
    Response.json({ ok: false, error: "invalid_handoff" }, { status: 400 }),
  );

  await expect(signIn.finishSignIn(input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await assertRelayRedemption(relay.requests.at(-1)!, authorization);
});

test("shared sign-in refuses a valid Google identity issued for a different relay client", async ({
  orm,
  fakeGoogle,
}) => {
  const { signIn, input, authorization, relay } = await startOwnerSignIn(orm, fakeGoogle.url);
  const grant = await googleRelayGrant(fakeGoogle.url, authorization, {
    clientId: "another-acme-client",
  });
  relay.redeem.mockReturnValueOnce(Response.json(grant));

  await expect(signIn.finishSignIn(input)).rejects.toBeInstanceOf(ApplicationError);
  await assertRelayRedemption(relay.requests.at(-1)!, authorization);
});

test.for(["another browser", "setup consent"])(
  "shared sign-in refuses %s before redeeming",
  async (problem, { orm, fakeGoogle }) => {
    const { signIn, input, setup, relay } = await startOwnerSignIn(orm, fakeGoogle.url);
    const wrongContext =
      problem === "setup consent"
        ? { state: setup.state, browserToken: setup.input.setupToken }
        : { browserToken: "other-acme-browser" };
    relay.redeem.mockClear();

    await expect(signIn.finishSignIn({ ...input, ...wrongContext })).rejects.toBeInstanceOf(
      ApplicationError,
    );
    expect(relay.redeem).not.toHaveBeenCalled();
  },
);

async function startOwnerSignIn(orm: Orm, googleUrl: string) {
  const setup = await startSharedGoogleSetup(orm, googleUrl);
  const relay = stubGoogleRelay();
  const grant = await googleRelayGrant(googleUrl, setup.authorization);
  relay.redeem.mockReturnValueOnce(Response.json(grant));
  const owner = await setup.connection.finishConsent(SETUP_HOLDER, {
    ...setup.input,
    state: setup.state,
    handle: RELAY_HANDLE,
  });
  const signIn = googleSignIn(orm, { googleUrl, relayUrl: GOOGLE_RELAY_URL });
  const { now } = setup.input;
  const publicOrigin = "https://alias.acme.example";
  const { authorizationUrl, browserToken } = await signIn.startSignIn({ now, publicOrigin });
  const authorization = new URL(authorizationUrl);
  const input = {
    now,
    publicOrigin,
    browserToken,
    handle: RELAY_HANDLE,
    state: authorization.searchParams.get("state")!,
  };
  return { setup, owner, signIn, relay, authorization, input };
}
