import { expect, it } from "vitest";

import { offeredChange, offersReconnect, startOfChange } from "./accountChange";

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

it.each([
  { reason: "the member can otherwise be disabled", facts: {}, offered: true },
  {
    reason: "the member owns the connection",
    facts: { record: { isConnectionUser: true } },
    offered: false,
  },
  { reason: "a change is running", facts: { changeRunning: true }, offered: false },
  { reason: "the scan has no matching member", facts: { record: null }, offered: false },
  {
    reason: "the connection is connected",
    facts: { connection: activeMember.connection },
    offered: false,
  },
] as const)("offers Reconnect = $offered when $reason", ({ facts, offered }) => {
  expect(
    offersReconnect({
      ...activeMember,
      connection: { ...activeMember.connection, status: "reconnect" },
      ...facts,
    }),
  ).toBe(offered);
});

const FROM_PROVISION = { startedFrom: "provision", employeeId: "emp_ivan" } as const;
const ASKED_ON_ROW = {
  startedFrom: "account",
  employeeId: null,
  action: "invite",
  subjectEmployeeId: "emp_ivan",
} as const;

it("keeps Provision as the start of a Try again after its change failed", () => {
  const latest = { ...FROM_PROVISION, action: "invite", status: "failed" } as const;

  expect(startOfChange(ASKED_ON_ROW, latest)).toEqual(FROM_PROVISION);
});

it("starts from Provision when Provision asks after a failed change asked on the row", () => {
  const latest = { startedFrom: "account", employeeId: null, action: "invite", status: "failed" };

  const asked = { ...FROM_PROVISION, action: "invite", subjectEmployeeId: "emp_ivan" } as const;

  expect(startOfChange(asked, latest as never)).toEqual(FROM_PROVISION);
});

it("starts from the row when the failed change was provisioned for another person", () => {
  const latest = { ...FROM_PROVISION, action: "invite", status: "failed" } as const;
  const asked = { ...ASKED_ON_ROW, subjectEmployeeId: "emp_lena" };

  expect(startOfChange(asked, latest)).toEqual({ startedFrom: "account", employeeId: null });
});

it("starts from the row when the latest change did not fail or asked for another action", () => {
  const done = { ...FROM_PROVISION, action: "invite", status: "succeeded" } as const;
  const other = { ...FROM_PROVISION, action: "suspend", status: "failed" } as const;

  expect(startOfChange(ASKED_ON_ROW, done)).toEqual({ startedFrom: "account", employeeId: null });
  expect(startOfChange(ASKED_ON_ROW, other)).toEqual({ startedFrom: "account", employeeId: null });
  expect(startOfChange(ASKED_ON_ROW, null)).toEqual({ startedFrom: "account", employeeId: null });
});
