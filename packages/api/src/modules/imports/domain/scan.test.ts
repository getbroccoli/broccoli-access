import { expect, it } from "vitest";

import type { ImportSource } from "./importSource";
import { scanOf } from "./scan";

it("shows people done with progress counts while the scan is still running", () => {
  const scan = scanOf(SOURCE, {
    progress: { people: { count: 42, suspended: 2 } },
    saved: { count: 40, suspended: 1 },
  });

  expect(scan).toEqual({
    id: SOURCE.id,
    status: "scanning",
    failure: null,
    readAt: null,
    people: { state: "done", count: 42, suspended: 2 },
  });
});

it("shows saved counts for a scanned source", () => {
  const source: ImportSource = {
    ...SOURCE,
    status: "scanned",
    readAt: new Date("2026-11-22T12:00:00Z"),
  };

  const scan = scanOf(source, {
    progress: { people: { count: 40, suspended: 1 } },
    saved: { count: 42, suspended: 2 },
  });

  expect(scan).toEqual({
    id: source.id,
    status: "scanned",
    failure: null,
    readAt: source.readAt,
    people: { state: "done", count: 42, suspended: 2 },
  });
});

it("shows people failed without counts even when progress and saved counts exist", () => {
  const source: ImportSource = {
    ...SOURCE,
    status: "scan_failed",
    failure: "permission_missing",
    readAt: new Date("2026-11-21T12:00:00Z"),
  };

  const scan = scanOf(source, {
    progress: { people: { count: 42, suspended: 2 } },
    saved: { count: 40, suspended: 1 },
  });

  expect(scan).toEqual({
    id: source.id,
    status: "scan_failed",
    failure: "permission_missing",
    readAt: source.readAt,
    people: { state: "failed", count: null, suspended: null },
  });
});

const SOURCE: ImportSource = {
  id: "source-google",
  kind: "app_connection",
  connectionId: "connection-google",
  name: "acme.example",
  status: "scanning",
  failure: null,
  readAt: null,
  createdAt: new Date("2026-11-21T12:00:00Z"),
};
