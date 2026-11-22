import { expect, it } from "vitest";

import { connectSearch } from "./connectSearch";

it.each(["cancelled", "not_super_admin", "failed"])(
  "keeps the connection error %s",
  (connectError) => {
    expect(connectSearch.parse({ connectError })).toEqual({ connectError });
  },
);

it.each([
  { connectError: undefined },
  { connectError: "unknown" },
  { connectError: 1 },
  { connectError: ["cancelled"] },
])("drops an unknown connection error $connectError", ({ connectError }) => {
  expect(connectSearch.parse({ connectError }).connectError).toBeUndefined();
});
