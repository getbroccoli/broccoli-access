import { onTestFinished, vi } from "vitest";
import {
  expect,
  test,
  EMPLOYEE,
  SETUP_HOLDER,
  googleSetup,
  googleConnection,
  GOOGLE_SCOPES,
  SHARED_GOOGLE_APP,
  GOOGLE_RELAY_URL,
  startSharedGoogleSetup,
} from "#test/support";

import { loadEnv } from "../../../core/env";

test("requests offline consent with all Google Workspace scopes and encrypted credentials", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);

  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);

  const url = new URL(authorizationUrl);
  expect(`${url.origin}${url.pathname}`).toBe(`${fakeGoogle.url}/o/oauth2/v2/auth`);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    client_id: input.clientId,
    redirect_uri: `${input.publicOrigin}/api/google/callback`,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });
  expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([...GOOGLE_SCOPES].sort());
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("nonce")).toBeTruthy();
  expect(decodeURIComponent(authorizationUrl)).not.toContain(input.clientSecret);
});

test("refuses a caller who is not the setup holder", async ({ orm, fakeGoogle }) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);

  await expect(connection.startConnection(EMPLOYEE, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test.for([null, "another-browser"])(
  "refuses the setup token %s",
  async (setupToken, { orm, fakeGoogle }) => {
    const { connection, input } = await googleSetup(orm, fakeGoogle.url);

    await expect(
      connection.startConnection(SETUP_HOLDER, { ...input, setupToken }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  },
);

test("refuses connecting after setup has reached scan", async ({ orm, seed, fakeGoogle }) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  await seed.setupStep("scan");

  await expect(connection.startConnection(SETUP_HOLDER, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test.for(["clientId", "clientSecret"] as const)(
  "requires a non-blank %s",
  async (field, { orm, fakeGoogle }) => {
    const { connection, input } = await googleSetup(orm, fakeGoogle.url);

    await expect(
      connection.startConnection(SETUP_HOLDER, { ...input, [field]: "  " }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field, code: "required" }],
    });
  },
);

test("sends shared Workspace consent to the configured relay with compact state and a PKCE challenge", async ({
  orm,
  fakeGoogle,
}) => {
  const { input, authorization } = await startSharedGoogleSetup(orm, fakeGoogle.url);

  expect(authorization.origin + authorization.pathname).toBe(
    GOOGLE_RELAY_URL + "/google/authorize",
  );
  expect(Object.fromEntries(authorization.searchParams)).toEqual({
    return_to: input.publicOrigin + "/api/google/callback",
    state: expect.stringMatching(/^[A-Za-z0-9_-]{1,256}$/) as unknown,
    code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown,
    nonce: expect.stringMatching(/^[A-Za-z0-9_-]{1,256}$/) as unknown,
    purpose: "connect",
  });
});

test("reports that the shared Google app is unavailable when no relay is configured", async ({
  orm,
  fakeGoogle,
}) => {
  const {
    connection,
    input: { publicOrigin, setupToken, now },
  } = await googleSetup(orm, fakeGoogle.url);

  await expect(
    connection.startConnection(SETUP_HOLDER, {
      ...SHARED_GOOGLE_APP,
      publicOrigin,
      setupToken,
      now,
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
});

test.for([
  "http://relay.acme.example",
  "https://fixture@relay.acme.example",
  "https://relay.acme.example?option=acme",
  "https://relay.acme.example/#acme",
])(
  "refuses shared consent with an unsafe relay URL %s before HTTP",
  async (relayUrl, { orm, databaseUrl, fakeGoogle }) => {
    const {
      input: { publicOrigin, setupToken, now },
    } = await googleSetup(orm, fakeGoogle.url);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected HTTP request"));
    onTestFinished(() => fetch.mockRestore());

    await expect(async () => {
      const config = loadEnv({ DATABASE_URL: databaseUrl, GOOGLE_RELAY_URL: relayUrl });
      const connection = googleConnection(orm, {
        googleUrl: fakeGoogle.url,
        relayUrl: config.googleRelayUrl,
      });
      await connection.startConnection(SETUP_HOLDER, {
        ...SHARED_GOOGLE_APP,
        publicOrigin,
        setupToken,
        now,
      });
    }).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  },
);
