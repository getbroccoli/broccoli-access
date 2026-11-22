/* eslint-disable @typescript-eslint/no-unsafe-return -- Vitest asymmetric matchers return any. */
import { expect } from "vitest";

import {
  ADMIN_SCOPES,
  CUSTOMER_PATH,
  signIn,
  test as it,
  USERS_PATH,
  type DirectoryUser,
  type DirectoryUsers,
  type DirectoryTokens,
} from "#test/support";
import { ACME } from "../seed";

it("serves a person's photo as a 96×96 PNG in web-safe base64", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const person = ACME.people.find(({ email }) => email === "ana@acme.example")!;

  const response = await fetch(
    `${fake.url}/admin/directory/v1/users/${person.id}/photos/thumbnail`,
    {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    },
  );

  expect(response.status).toBe(200);
  const body = (await response.json()) as { photoData: string };
  expect(body).toMatchObject({
    kind: "admin#directory#user#photo",
    id: person.id,
    etag: expect.any(String) as unknown,
    primaryEmail: person.email,
    mimeType: "image/png",
    width: 96,
    height: 96,
  });
  expect(body.photoData).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
  const photo = Buffer.from(body.photoData, "base64url");
  expect(photo).toEqual(person.photo);
  expect(photo.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(photo.toString("ascii", 12, 16)).toBe("IHDR");
  expect(photo.readUInt32BE(16)).toBe(96);
  expect(photo.readUInt32BE(20)).toBe(96);
});

it("answers with Google's not-found body for a person without a photo", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  const response = await fetch(
    `${fake.url}/admin/directory/v1/users/admin@acme.example/photos/thumbnail`,
    {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    },
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: {
      code: 404,
      status: "NOT_FOUND",
      message: "Resource Not Found: userKey",
      errors: [{ domain: "global", reason: "notFound", message: "Resource Not Found: userKey" }],
    },
  });
});

it("lists thumbnailPhotoEtag for exactly the people with a photo, equal to the photo's etag", async ({
  fake,
}) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const headers = { authorization: `Bearer ${tokens.access_token}` };

  const response = await fetch(`${fake.url}${USERS_PATH}`, { headers });

  expect(response.status).toBe(200);
  const { users } = (await response.json()) as DirectoryUsers;
  expect(users.filter(({ thumbnailPhotoEtag }) => thumbnailPhotoEtag !== undefined)).toHaveLength(
    11,
  );
  for (const person of ACME.people) {
    const user = users.find(({ id }) => id === person.id)!;
    if (person.photo === null) {
      expect(user).not.toHaveProperty("thumbnailPhotoEtag");
    } else {
      const photo = await fetch(
        `${fake.url}/admin/directory/v1/users/${person.id}/photos/thumbnail`,
        { headers },
      );
      expect(photo.status).toBe(200);
      const body = (await photo.json()) as { etag: string };
      expect(body.etag).toEqual(expect.any(String));
      expect(user.thumbnailPhotoEtag).toBe(body.etag);
    }
  }
});

it("gives a changed photo a new etag and drops it for a removed photo", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const headers = { authorization: `Bearer ${tokens.access_token}` };
  const path = `${fake.url}/admin/directory/v1/users/ana@acme.example/photos/thumbnail`;
  const beforeResponse = await fetch(path, { headers });
  expect(beforeResponse.status).toBe(200);
  const before = (await beforeResponse.json()) as { etag: string };
  const replacement = ACME.people.find(({ email }) => email === "ben@acme.example")!.photo!;

  fake.setPhoto("ana@acme.example", replacement);

  const changedResponse = await fetch(path, { headers });
  expect(changedResponse.status).toBe(200);
  const changed = (await changedResponse.json()) as { etag: string; photoData: string };
  expect(changed.etag).toEqual(expect.any(String));
  expect(changed.etag).not.toBe(before.etag);
  expect(Buffer.from(changed.photoData, "base64url")).toEqual(replacement);
  const changedUsers = (await (
    await fetch(`${fake.url}${USERS_PATH}`, { headers })
  ).json()) as DirectoryUsers;
  expect(
    changedUsers.users.find(({ primaryEmail }) => primaryEmail === "ana@acme.example")
      ?.thumbnailPhotoEtag,
  ).toBe(changed.etag);

  fake.setPhoto("ana@acme.example", null);

  expect((await fetch(path, { headers })).status).toBe(404);
  const removedUsers = (await (
    await fetch(`${fake.url}${USERS_PATH}`, { headers })
  ).json()) as DirectoryUsers;
  expect(
    removedUsers.users.find(({ primaryEmail }) => primaryEmail === "ana@acme.example"),
  ).not.toHaveProperty("thumbnailPhotoEtag");
});

it("returns the seeded customer in Google's shape", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  const response = await fetch(`${fake.url}${CUSTOMER_PATH}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    kind: "admin#directory#customer",
    id: ACME.customer.id,
    customerDomain: ACME.customer.domain,
    postalAddress: { organizationName: ACME.customer.organizationName },
    customerCreationTime: ACME.customer.creationTime,
  });
});

it("returns all seeded people with their status and manager relation", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  const response = await fetch(`${fake.url}${USERS_PATH}&projection=full`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as DirectoryUsers;
  expect(body.kind).toBe("admin#directory#users");
  expect(body.users).toHaveLength(ACME.people.length);
  for (const person of ACME.people) {
    const user = body.users.find((candidate: DirectoryUser) => candidate.id === person.id)!;
    expect(user).toMatchObject({
      kind: "admin#directory#user",
      id: person.id,
      primaryEmail: person.email,
      name: {
        givenName: person.givenName,
        familyName: person.familyName,
        fullName: `${person.givenName} ${person.familyName}`,
      },
      isAdmin: person.isSuperAdmin,
      suspended: person.suspended,
      orgUnitPath: "/",
      customerId: ACME.customer.id,
      creationTime: person.creationTime,
    });
    expect(
      user.relations?.filter((relation: { type: string }) => relation.type === "manager") ?? [],
    ).toEqual(
      person.managerEmail === null ? [] : [{ type: "manager", value: person.managerEmail }],
    );
  }
});

it("returns the whole seed in one default page without a next page token", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  const response = await fetch(`${fake.url}${USERS_PATH}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as DirectoryUsers;
  expect(body.users.map((user: DirectoryUser) => user.primaryEmail)).toEqual(
    ACME.people.map((person) => person.email).sort(),
  );
  expect(body).not.toHaveProperty("nextPageToken");
});

it("pages every user once in email order", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const emails: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < Math.ceil(ACME.people.length / 10); page++) {
    const query = new URLSearchParams({
      customer: "my_customer",
      maxResults: "10",
      orderBy: "email",
      projection: "basic",
      ...(pageToken ? { pageToken } : {}),
    });
    const response = await fetch(`${fake.url}/admin/directory/v1/users?${query.toString()}`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as DirectoryUsers;
    expect(body.users).toHaveLength(Math.min(10, ACME.people.length - emails.length));
    emails.push(...body.users.map((user: DirectoryUser) => user.primaryEmail));
    pageToken = body.nextPageToken;
    if (emails.length < ACME.people.length) expect(pageToken).toBeTruthy();
    else expect(body).not.toHaveProperty("nextPageToken");
  }

  expect(emails).toEqual(ACME.people.map((person) => person.email).sort());
});

it.for([0, 501])("rejects maxResults=%i for users", async (maxResults, { fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  const response = await fetch(`${fake.url}${USERS_PATH}&maxResults=${maxResults}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { errors: [{ reason: "invalid" }] } });
});

it.for(["id", "email"] as const)(
  "finds a person's exact seed tokens by %s",
  async (key, { fake }) => {
    const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
    const person = ACME.people.find((candidate) => candidate.email === "ana@acme.example")!;

    const response = await fetch(
      `${fake.url}/admin/directory/v1/users/${encodeURIComponent(person[key])}/tokens`,
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as DirectoryTokens;
    const expected = ACME.grants
      .filter((grant) => grant.email === person.email)
      .map((grant) =>
        expect.objectContaining({
          kind: "admin#directory#token",
          clientId: grant.clientId,
          displayText: ACME.apps.find((app) => app.clientId === grant.clientId)!.name,
          scopes: grant.scopes,
          userKey: person.id,
          anonymous: false,
          nativeApp: false,
        }),
      );
    expect(body.kind).toBe("admin#directory#tokenList");
    expect(body.items).toHaveLength(expected.length);
    expect(body.items).toEqual(expect.arrayContaining(expected));
    expect(body).not.toHaveProperty("nextPageToken");
  },
);
