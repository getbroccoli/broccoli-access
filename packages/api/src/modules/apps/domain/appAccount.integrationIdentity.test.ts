import { expect, it } from "vitest";

import { planAccountSync, type AppAccount, type FoundAccount } from "./appAccount";

it.each(["external", "service"] as const)(
  "keeps the owner's %s mark and note when the integration user's email matches",
  (kind) => {
    const marked = { ...UNLINKED, kind, note: "Release engineering" };

    expect(rescan(marked, { isIntegrationUser: true, employeeId: null })).toEqual({
      created: [],
      updated: [],
      deleted: [],
    });
  },
);

it("keeps the owner's person link when the integration user's email matches", () => {
  const linked: AppAccount = {
    ...UNLINKED,
    employeeId: "chosen-person",
    employeeLinkedBy: "owner",
  };

  expect(rescan(linked, { isIntegrationUser: true, employeeId: null })).toEqual({
    created: [],
    updated: [],
    deleted: [],
  });
});

it("marks an unlinked account automatically and resumes email matching when the integration user moves", () => {
  const marked = rescan(UNLINKED, { isIntegrationUser: true, employeeId: null });
  expect(marked.updated).toEqual([
    { before: UNLINKED, after: { ...UNLINKED, kind: "service", note: null } },
  ]);
  const service = marked.updated[0]!.after;

  const restored = rescan(service, { isIntegrationUser: false, employeeId: "matching-person" });

  expect(restored.updated).toEqual([
    {
      before: service,
      after: { ...UNLINKED, employeeId: "matching-person", employeeLinkedBy: "email" },
    },
  ]);
});

function rescan(
  before: AppAccount,
  identity: Pick<FoundAccount, "isIntegrationUser" | "employeeId">,
) {
  const { appId, email, status, grantedAt, grantedBefore } = before;
  return planAccountSync([before], {
    findingKind: "linear_members",
    found: [{ appId, email, status, grantedAt, grantedBefore, ...identity }],
    now: before.firstSeenAt,
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
  });
}

const UNLINKED: AppAccount = {
  id: "account",
  appId: "linear",
  email: "release@acme.example",
  kind: "personal",
  note: null,
  employeeId: null,
  employeeLinkedBy: null,
  status: "active",
  foundVia: ["linear_members"],
  firstSeenAt: new Date("2026-11-21T12:00:00Z"),
  grantedAt: null,
  grantedBefore: null,
};
