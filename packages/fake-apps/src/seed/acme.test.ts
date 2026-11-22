import { describe, expect, it } from "vitest";

import { ACME } from ".";

describe("Acme people", () => {
  it("gives the 11 named people distinct placeholder portraits and nobody else one", () => {
    const peopleWithPhotos = ACME.people.filter(({ photo }) => photo !== null);

    expect(peopleWithPhotos.map(({ email }) => email).sort()).toEqual([
      "ana@acme.example",
      "ben@acme.example",
      "chloe@acme.example",
      "david@acme.example",
      "elif@acme.example",
      "farah@acme.example",
      "gabriel@acme.example",
      "hannah@acme.example",
      "ivan@acme.example",
      "jun@acme.example",
      "lena@acme.example",
    ]);
    for (const { photo } of peopleWithPhotos) {
      expect(Buffer.isBuffer(photo)).toBe(true);
      expect(photo!.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(photo!.toString("ascii", 12, 16)).toBe("IHDR");
      expect(photo!.readUInt32BE(16)).toBe(96);
      expect(photo!.readUInt32BE(20)).toBe(96);
    }
    expect(new Set(peopleWithPhotos.map(({ photo }) => photo!.toString("base64"))).size).toBe(11);
  });

  it("has 42 people with unique Google IDs and emails", () => {
    expect(ACME.people).toHaveLength(42);
    expect(new Set(ACME.people.map((person) => person.id)).size).toBe(42);
    expect(new Set(ACME.people.map((person) => person.email)).size).toBe(42);
    for (const person of ACME.people) expect(person.id).toMatch(/^\d{21}$/);
  });

  it("suspends only Ana and Ben", () => {
    expect(
      ACME.people
        .filter((person) => person.suspended)
        .map((person) => person.email)
        .sort(),
    ).toEqual(["ana@acme.example", "ben@acme.example"]);
  });

  it("makes Mia Novak the only super admin", () => {
    expect(ACME.people.filter((person) => person.isSuperAdmin)).toEqual([
      expect.objectContaining({
        email: "admin@acme.example",
        givenName: "Mia",
        familyName: "Novak",
      }),
    ]);
  });

  it("makes David Ana's manager", () => {
    expect(ACME.people.find((person) => person.email === "ana@acme.example")?.managerEmail).toBe(
      "david@acme.example",
    );
  });

  it("forms one manager tree rooted at Mia", () => {
    const people = new Map(ACME.people.map((person) => [person.email, person]));
    expect(
      ACME.people.filter((person) => person.managerEmail === null).map((person) => person.email),
    ).toEqual(["admin@acme.example"]);
    for (const person of ACME.people) {
      const visited = new Set<string>();
      let current = person;
      while (current.managerEmail !== null) {
        expect(visited.has(current.email)).toBe(false);
        visited.add(current.email);
        const manager = people.get(current.managerEmail);
        expect(manager).toBeDefined();
        current = manager!;
      }
      expect(current.email).toBe("admin@acme.example");
    }
  });
});

describe("Acme grants", () => {
  it("has 37 distinct third-party apps, excluding its own OAuth client", () => {
    expect(ACME.apps).toHaveLength(37);
    expect(new Set(ACME.apps.map((app) => app.clientId)).size).toBe(37);
    expect(ACME.apps.map((app) => app.clientId)).not.toContain(ACME.oauthClient.clientId);
    expect(ACME.apps).toEqual(
      expect.arrayContaining([
        { name: "Figma", clientId: "871234567890-figma.apps.googleusercontent.com" },
        { name: "Claude", clientId: "301234567890-claude.apps.googleusercontent.com" },
      ]),
    );
  });

  it.each([
    ["Slack", 41],
    ["Notion", 31],
    ["Figma", 16],
    ["Miro", 12],
    ["Loom", 11],
    ["Claude", 9],
    ["ChatGPT", 7],
    ["Canva", 5],
    ["Calendly", 4],
    ["Zoom", 4],
    ["Typeform", 3],
    ["Grammarly", 2],
  ])("gives %s to exactly %i people", (name, count) => {
    const app = ACME.apps.find((candidate) => candidate.name === name)!;
    const grants = ACME.grants.filter((grant) => grant.clientId === app.clientId);
    expect(grants).toHaveLength(count);
    expect(new Set(grants.map((grant) => grant.email)).size).toBe(count);
  });

  it.each([
    ["admin", ["Slack"]],
    ["ana", ["Figma", "Notion", "Slack"]],
    ["ben", ["Slack"]],
    ["chloe", ["Figma", "Notion", "Slack", "Miro", "Loom"]],
    ["david", ["Figma", "Miro", "Notion", "Slack"]],
    ["elif", ["Figma", "Notion", "Slack"]],
    ["farah", ["Claude", "Figma", "Notion", "Slack", "Loom"]],
    ["gabriel", ["Claude", "Figma", "Slack"]],
    ["hannah", ["Figma", "Loom", "Notion", "Slack"]],
    ["ivan", ["Notion"]],
    ["jun", ["Claude", "Figma", "Miro", "Notion", "Slack"]],
    ["lena", ["Figma", "Slack"]],
  ])("gives %s exactly their designed apps", (localPart, names) => {
    const actual = ACME.grants
      .filter((grant) => grant.email === `${localPart}@acme.example`)
      .map((grant) => ACME.apps.find((app) => app.clientId === grant.clientId)?.name);
    expect(actual.sort()).toEqual([...names].sort());
  });

  it("gives each of the other 25 apps to one or two generated people", () => {
    const counted = new Set([
      "Slack",
      "Notion",
      "Figma",
      "Miro",
      "Loom",
      "Claude",
      "ChatGPT",
      "Canva",
      "Calendly",
      "Zoom",
      "Typeform",
      "Grammarly",
    ]);
    const named = new Set(
      [
        "admin",
        "ana",
        "ben",
        "chloe",
        "david",
        "elif",
        "farah",
        "gabriel",
        "hannah",
        "ivan",
        "jun",
        "lena",
      ].map((name) => `${name}@acme.example`),
    );
    const remaining = ACME.apps.filter((app) => !counted.has(app.name));
    expect(remaining).toHaveLength(25);
    for (const app of remaining) {
      const grants = ACME.grants.filter((grant) => grant.clientId === app.clientId);
      expect(grants.length).toBeGreaterThanOrEqual(1);
      expect(grants.length).toBeLessThanOrEqual(2);
      expect(grants.every((grant) => !named.has(grant.email))).toBe(true);
    }
  });

  it("references real people and apps once per grant", () => {
    expect(new Set(ACME.grants.map((grant) => `${grant.email}/${grant.clientId}`)).size).toBe(
      ACME.grants.length,
    );
    for (const grant of ACME.grants) {
      expect(ACME.people.some((person) => person.email === grant.email)).toBe(true);
      expect(ACME.apps.some((app) => app.clientId === grant.clientId)).toBe(true);
    }
  });

  it("puts exactly the five recent apps and two Figma grants in the 180-day log", () => {
    const recentNames = new Set(["Claude", "ChatGPT", "Calendly", "Typeform", "Grammarly"]);
    const expected = ACME.grants.filter((grant) => {
      const name = ACME.apps.find((app) => app.clientId === grant.clientId)!.name;
      return (
        recentNames.has(name) ||
        (name === "Figma" && ["gabriel@acme.example", "lena@acme.example"].includes(grant.email))
      );
    });
    const recent = ACME.grants.filter((grant) => grant.daysBeforeStart <= 180);
    expect(recent).toHaveLength(27);
    expect(recent).toEqual(expected);
    for (const grant of recent) {
      expect(Number.isInteger(grant.daysBeforeStart)).toBe(true);
      expect(grant.daysBeforeStart).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([
    ["Claude", 142],
    ["ChatGPT", 163],
    ["Calendly", 108],
    ["Typeform", 52],
    ["Grammarly", 40],
  ])("dates the first %s grant %i days before start", (name, days) => {
    const app = ACME.apps.find((candidate) => candidate.name === name)!;
    const offsets = ACME.grants
      .filter((grant) => grant.clientId === app.clientId)
      .map((grant) => grant.daysBeforeStart);
    expect(Math.max(...offsets)).toBe(days);
  });

  it.each([
    ["gabriel", 101],
    ["lena", 76],
  ])("dates %s's Figma grant %i days before start", (name, days) => {
    expect(
      ACME.grants.find(
        (grant) =>
          grant.email === `${name}@acme.example` &&
          grant.clientId === "871234567890-figma.apps.googleusercontent.com",
      )?.daysBeforeStart,
    ).toBe(days);
  });
});
