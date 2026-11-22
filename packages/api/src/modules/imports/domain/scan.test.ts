import { expect, it } from "vitest";

import type { ImportSource } from "./importSource";
import { scanOf } from "./scan";

it("shows all steps done with progress counts while the scan is still running", () => {
  const scan = scanOf(SOURCE, {
    progress: { found: { people: 42, suspended: 2, apps: 37 } },
    saved: { people: 40, suspended: 1, apps: 30 },
  });

  expect(scan).toEqual({
    id: SOURCE.id,
    status: "scanning",
    failure: null,
    readAt: null,
    people: { state: "done", count: 42, suspended: 2 },
    apps: { state: "done", count: 37 },
    signInLogs: { state: "done" },
  });
});

it("shows saved counts for a scanned source", () => {
  const source: ImportSource = {
    ...SOURCE,
    status: "scanned",
    readAt: new Date("2026-11-22T12:00:00Z"),
  };

  const scan = scanOf(source, {
    progress: { found: { people: 40, suspended: 1, apps: 30 } },
    saved: { people: 42, suspended: 2, apps: 37 },
  });

  expect(scan).toEqual({
    id: source.id,
    status: "scanned",
    failure: null,
    readAt: source.readAt,
    people: { state: "done", count: 42, suspended: 2 },
    apps: { state: "done", count: 37 },
    signInLogs: { state: "done" },
  });
});

it("shows all steps failed without counts even when progress and saved counts exist", () => {
  const source: ImportSource = {
    ...SOURCE,
    status: "scan_failed",
    failure: "permission_missing",
    readAt: new Date("2026-11-21T12:00:00Z"),
  };

  const scan = scanOf(source, {
    progress: { found: { people: 42, suspended: 2, apps: 37 } },
    saved: { people: 40, suspended: 1, apps: 30 },
  });

  expect(scan).toEqual({
    id: source.id,
    status: "scan_failed",
    failure: "permission_missing",
    readAt: source.readAt,
    people: { state: "failed", count: null, suspended: null },
    apps: { state: "failed", count: null },
    signInLogs: { state: "failed" },
  });
});

it.each([null, { found: null }])(
  "waits for apps and sign-in logs while reading accounts (%j)",
  (progress) => {
    const scan = scanOf(SOURCE, {
      progress,
      saved: { people: 42, suspended: 2, apps: 37 },
    });

    expect(scan).toEqual({
      id: SOURCE.id,
      status: "scanning",
      failure: null,
      readAt: null,
      people: { state: "running", count: null, suspended: null },
      apps: { state: "waiting", count: null },
      signInLogs: { state: "waiting" },
    });
  },
);

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
