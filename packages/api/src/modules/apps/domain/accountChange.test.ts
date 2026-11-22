import { expect, it } from "vitest";

import { offeredChange } from "./accountChange";

const activeMember = {
  status: "active",
  connection: { status: "connected", changesAccounts: true },
  record: { isConnectionUser: false },
  changeRunning: false,
} as const;

it("offers Disable on an active member", () => {
  expect(offeredChange(activeMember)).toBe("suspend");
});

it("offers Enable on a suspended member", () => {
  expect(offeredChange({ ...activeMember, status: "suspended" })).toBe("reactivate");
});

it.each([
  { reason: "the app has no connection", facts: { connection: null } },
  {
    reason: "the connector cannot change accounts",
    facts: { connection: { ...activeMember.connection, changesAccounts: false } },
  },
  {
    reason: "the connection needs reconnecting",
    facts: { connection: { ...activeMember.connection, status: "reconnect" } },
  },
  { reason: "the scan has no matching member", facts: { record: null } },
  { reason: "the member owns the connection", facts: { record: { isConnectionUser: true } } },
  { reason: "a change is running", facts: { changeRunning: true } },
] as const)("offers neither action when $reason", ({ facts }) => {
  expect(offeredChange({ ...activeMember, ...facts })).toBeNull();
});
