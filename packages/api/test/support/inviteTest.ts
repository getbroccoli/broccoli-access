import assert from "node:assert/strict";

import type { Invitation } from "@broccoli-access/connector-contract";

import type { Orm } from "../../src/core/db";
import { PrincipalSecurityContext } from "../../src/core/security";
import { employeeDirectory } from "../../src/modules/employees";
import { accountChanges, scannedLinear } from "./accountChanges";
import { test } from "./fixture";
import { googleScanSetup } from "./googleScanSetup";
import { recordingJobQueue } from "./recordingJobQueue";
import { storedEmployees } from "./storedScan";
import { SYSTEM } from "./testSecurityContext";

export const inviteTest = test.extend<{ workspace: Awaited<ReturnType<typeof scannedWorkspace>> }>({
  workspace: async ({ orm, fakeGoogle, fakeConnectors }, use) => {
    await use(await scannedWorkspace(orm, fakeGoogle.url, fakeConnectors.url));
  },
});

/** Linear's pending invitations addressed to this person. */
export async function linearInvitations(url: string, email: string) {
  const response = await fetch(`${url}/_fake/state`);
  assert.equal(response.status, 200);
  const state = (await response.json()) as { invitations: { linear: Invitation[] } };
  return state.invitations.linear.filter((invite) => invite.email === email);
}

async function scannedWorkspace(orm: Orm, googleUrl: string, connectorsUrl: string) {
  const google = await googleScanSetup(orm, googleUrl);
  await google.scans.runScan(SYSTEM, google.sourceId);
  const linear = await scannedLinear(orm, connectorsUrl);
  const people = await storedEmployees(orm);
  const employee = (email: string) => {
    const person = people.find((person) => person.email === email);
    assert(person, `No scanned employee with email ${email}`);
    return person;
  };
  const mia = employee("admin@acme.example");
  const owner = PrincipalSecurityContext.user(
    {
      userId: google.ownerUserId,
      email: mia.email,
      isOwner: true,
      permissionProfiles: ["EMPLOYEE", "OWNER"],
      employeeId: mia.id,
    },
    employeeDirectory(orm),
  );
  const { jobs, sent } = recordingJobQueue();
  const service = accountChanges(orm, { connectorsUrl, jobs });
  const ivan = employee("ivan@acme.example");
  return {
    linear,
    owner,
    service,
    sent,
    employee,
    ivan,
    input: { employeeId: ivan.id, appId: linear.appId },
  };
}
