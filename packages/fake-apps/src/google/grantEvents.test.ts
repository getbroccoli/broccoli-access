/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- Vitest asymmetric matchers return any. */
import { expect } from "vitest";

import {
  ADMIN_SCOPES,
  DAY,
  eventClientId,
  REPORTS_PATH,
  signIn,
  test as it,
  type GrantEvent,
  type GrantEvents,
} from "#test/support";
import { ACME } from "../seed";

it("returns exactly the 27 seeded authorize events at their relative times", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  const response = await fetch(`${fake.url}${REPORTS_PATH}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as GrantEvents;
  const seeded: GrantEvent[] = body.items.filter(
    (event: GrantEvent) => eventClientId(event) !== ACME.oauthClient.clientId,
  );
  expect(seeded).toHaveLength(27);
  expect(body.items).toHaveLength(seeded.length + 1);
  const expected = ACME.grants
    .filter((grant) => grant.daysBeforeStart <= 180)
    .map((grant) =>
      expect.objectContaining({
        kind: "admin#reports#activity",
        id: expect.objectContaining({
          time: new Date(fake.startedAt.getTime() - grant.daysBeforeStart * DAY).toISOString(),
          applicationName: "token",
          customerId: ACME.customer.id,
        }),
        actor: {
          email: grant.email,
          profileId: ACME.people.find((person) => person.email === grant.email)!.id,
        },
        events: [
          {
            type: "auth",
            name: "authorize",
            parameters: expect.arrayContaining([
              { name: "client_id", value: grant.clientId },
              {
                name: "app_name",
                value: ACME.apps.find((app) => app.clientId === grant.clientId)!.name,
              },
              { name: "client_type", value: "WEB" },
              { name: "scope", multiValue: grant.scopes },
            ]),
          },
        ],
      }),
    );
  expect(seeded).toEqual(expect.arrayContaining(expected));
  const times = body.items.map((event: GrantEvent) => Date.parse(event.id.time));
  expect(times).toEqual([...times].sort((left: number, right: number) => right - left));
  expect(body).not.toHaveProperty("nextPageToken");
});

it("moves the 180-day retention window with the request clock", async ({ fake }) => {
  fake.now = new Date(fake.startedAt.getTime() + 100 * DAY);
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  const response = await fetch(`${fake.url}${REPORTS_PATH}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as GrantEvents;
  const seeded: GrantEvent[] = body.items.filter(
    (event: GrantEvent) => eventClientId(event) !== ACME.oauthClient.clientId,
  );
  const expected = ACME.grants.filter((grant) => grant.daysBeforeStart <= 80);
  expect(seeded).toHaveLength(expected.length);
  for (const event of body.items)
    expect(Date.parse(event.id.time)).toBeGreaterThanOrEqual(fake.now.getTime() - 180 * DAY);
  expect(seeded.map((event) => `${event.actor.email}/${eventClientId(event)}`).sort()).toEqual(
    expected.map((grant) => `${grant.email}/${grant.clientId}`).sort(),
  );
});

it("pages every grant event once in newest-first order", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const headers = { authorization: `Bearer ${tokens.access_token}` };
  const all = (await fetch(`${fake.url}${REPORTS_PATH}`, { headers }).then((response) =>
    response.json(),
  )) as GrantEvents;
  const events: GrantEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < Math.ceil(all.items.length / 5); page++) {
    const query = new URLSearchParams({ maxResults: "5", ...(pageToken ? { pageToken } : {}) });
    const response = await fetch(`${fake.url}${REPORTS_PATH}&${query.toString()}`, { headers });
    expect(response.status).toBe(200);
    const body = (await response.json()) as GrantEvents;
    expect(body.items).toHaveLength(Math.min(5, all.items.length - events.length));
    events.push(...body.items);
    pageToken = body.nextPageToken;
    if (events.length < all.items.length) expect(pageToken).toBeTruthy();
    else expect(body).not.toHaveProperty("nextPageToken");
  }

  expect(events).toEqual(all.items);
  expect(new Set(events.map((event) => `${event.id.time}/${event.id.uniqueQualifier}`)).size).toBe(
    events.length,
  );
});

it.for(["startTime", "endTime", "both"])("filters grant events by %s", async (filter, { fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const headers = { authorization: `Bearer ${tokens.access_token}` };
  const all = (await fetch(`${fake.url}${REPORTS_PATH}`, { headers }).then((response) =>
    response.json(),
  )) as GrantEvents;
  const start = fake.startedAt.getTime() - 110.5 * DAY;
  const end = fake.startedAt.getTime() - 50.5 * DAY;
  const query = new URLSearchParams({
    ...(filter !== "endTime" ? { startTime: new Date(start).toISOString() } : {}),
    ...(filter !== "startTime" ? { endTime: new Date(end).toISOString() } : {}),
  });

  const response = await fetch(`${fake.url}${REPORTS_PATH}&${query.toString()}`, { headers });

  expect(response.status).toBe(200);
  const expected = all.items.filter(
    (event: GrantEvent) =>
      (filter === "endTime" || Date.parse(event.id.time) >= start) &&
      (filter === "startTime" || Date.parse(event.id.time) <= end),
  );
  expect(((await response.json()) as GrantEvents).items).toEqual(expected);
});

it("rejects a startTime later than endTime", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const query = new URLSearchParams({
    startTime: new Date(fake.now.getTime() - DAY).toISOString(),
    endTime: new Date(fake.now.getTime() - 2 * DAY).toISOString(),
  });

  const response = await fetch(`${fake.url}${REPORTS_PATH}&${query.toString()}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { errors: [{ reason: "invalid" }] } });
});

it("rejects a startTime later than the current clock", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const query = new URLSearchParams({
    startTime: new Date(fake.now.getTime() + DAY).toISOString(),
  });

  const response = await fetch(`${fake.url}${REPORTS_PATH}&${query.toString()}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { errors: [{ reason: "invalid" }] } });
});

it.for([0, 1001])("rejects maxResults=%i for grant events", async (maxResults, { fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  const response = await fetch(`${fake.url}${REPORTS_PATH}&maxResults=${maxResults}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { errors: [{ reason: "invalid" }] } });
});
