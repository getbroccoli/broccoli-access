import { expect, it } from "vitest";

import { employeePanelSearch } from "./employeePanelSearch";

it("opens Overview for an empty search", () => {
  const search = employeePanelSearch.parse({});

  expect(search).toEqual({ tab: "overview" });
});

it("keeps History", () => {
  const search = employeePanelSearch.parse({ tab: "history" });

  expect(search).toEqual({ tab: "history" });
});

it("falls back to Overview for an unknown tab", () => {
  const search = employeePanelSearch.parse({ tab: "unknown" });

  expect(search).toEqual({ tab: "overview" });
});
