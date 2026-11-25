import { expect, it } from "vitest";

import { planAppMatches, type KnownApp } from "./app";

it("keeps the known app for an external id even when the source names another catalog app", () => {
  const known: KnownApp = {
    id: "app-design",
    name: "Design",
    catalogKey: null,
    externalIds: ["google:1-figma"],
  };

  const plan = planAppMatches([known], [{ externalId: "google:1-figma", name: "Slack" }]);

  expect(plan).toEqual({ created: [], updated: [] });
});

it("creates a catalog app when the found name differs only in case", () => {
  const plan = planAppMatches([], [{ externalId: "google:1-figma", name: "figma" }]);

  expect(plan).toEqual({
    created: [
      { name: "Figma", domain: "figma.com", catalogKey: "figma", externalIds: ["google:1-figma"] },
    ],
    updated: [],
  });
});

it("adds an unknown external id to the known catalog app", () => {
  const known: KnownApp = {
    id: "app-figma",
    name: "Design",
    catalogKey: "figma",
    externalIds: ["google:1-figma"],
  };

  const plan = planAppMatches([known], [{ externalId: "google:2-figma", name: "FIGMA" }]);

  expect(plan).toEqual({
    created: [],
    updated: [
      { before: known, after: { ...known, externalIds: ["google:1-figma", "google:2-figma"] } },
    ],
  });
});

it("creates an unknown app with the source's name and no catalog or domain", () => {
  const plan = planAppMatches([], [{ externalId: "google:1-asana", name: "Asana" }]);

  expect(plan).toEqual({
    created: [{ name: "Asana", domain: null, catalogKey: null, externalIds: ["google:1-asana"] }],
    updated: [],
  });
});

it("creates one app when the same external id is found more than once", () => {
  const found = { externalId: "google:1-asana", name: "Asana" };

  const plan = planAppMatches([], [found, found, found]);

  expect(plan).toEqual({
    created: [{ name: "Asana", domain: null, catalogKey: null, externalIds: [found.externalId] }],
    updated: [],
  });
});

it("collects two external ids with the same catalog name into one new app", () => {
  const plan = planAppMatches(
    [],
    [
      { externalId: "google:1-figma", name: "Figma" },
      { externalId: "google:2-figma", name: "figma" },
    ],
  );

  expect(plan).toEqual({
    created: [
      {
        name: "Figma",
        domain: "figma.com",
        catalogKey: "figma",
        externalIds: ["google:1-figma", "google:2-figma"],
      },
    ],
    updated: [],
  });
});
