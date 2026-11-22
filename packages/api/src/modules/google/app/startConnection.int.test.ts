import { expect, test, EMPLOYEE, SETUP_HOLDER, googleSetup, GOOGLE_SCOPES } from "#test/support";

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
