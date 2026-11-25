import assert from "node:assert/strict";

import type { Invitation } from "@broccoli-access/connector-contract";

import type { Orm } from "../../src/core/db";
import { PrincipalSecurityContext } from "../../src/core/security";
import { employeeDirectory } from "../../src/modules/employees";
import { accountChanges, scannedLinear } from "./accountChanges";
import { containerConnectors } from "./containerConnections";
import { personPages, provisioning, templates } from "./services";
import type { TestSeed } from "./testSeed";
import { test } from "./fixture";
import { googleScanSetup } from "./googleScanSetup";
import { recordingJobQueue } from "./recordingJobQueue";
import { storedEmployees } from "./storedScan";
import { SYSTEM } from "./testSecurityContext";

export const inviteTest = test.extend<{ workspace: Awaited<ReturnType<typeof scannedWorkspace>> }>({
  workspace: async ({ orm, seed, fakeGoogle, fakeConnectors }, use) => {
    await use(await scannedWorkspace(orm, seed, fakeGoogle.url, fakeConnectors.url));
  },
});

/** Linear's pending invitations addressed to this person. */
export async function linearInvitations(url: string, email: string) {
  const response = await fetch(`${url}/_fake/state`);
  assert.equal(response.status, 200);
  const state = (await response.json()) as {
    invitations: { linear: (Invitation & { role: string })[] };
  };
  return state.invitations.linear.filter((invite) => invite.email === email);
}

async function scannedWorkspace(
  orm: Orm,
  seed: TestSeed,
  googleUrl: string,
  connectorsUrl: string,
) {
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
  const connectors = containerConnectors(connectorsUrl);
  const service = accountChanges(orm, { connectors, googleUrl, jobs });
  const ivan = employee("ivan@acme.example");
  const provision = provisioning(orm, { connectors, jobs });
  const pages = personPages(orm, { connectors });
  const input = { employeeId: ivan.id, appId: linear.appId };
  return {
    templates: templates(orm, { connectors }),
    provision,
    pages,
    /** Provisions every step the person's page shows, as confirming its dialog does. */
    provisionShown: async (employeeId: string) => {
      const [page] = await pages(owner, [employeeId]);
      const appIds = page!.provisionSteps.map(({ appId }) => appId);
      return provision.provisionEmployee(owner, { employeeId, appIds });
    },
    /** Gives Ivan a template with an approved app that has no connection. */
    assignAppWithoutConnection: async () => {
      const app = await seed.app({
        name: "Payroll",
        domain: "payroll.example",
        catalogKey: null,
        status: "approved",
      });
      await seed.assignedTemplateApp({
        employeeId: ivan.id,
        appId: app.id,
        role: null,
        assignedBy: google.ownerUserId,
      });
      return app;
    },
    offboardingInput: async (employeeId: string) => {
      const [plan] = await service.readOffboardings(owner, [employeeId]);
      return { employeeId, appIds: plan!.accountsToDisable.map(({ appId }) => appId) };
    },
    assignLinearRole: (role: string | null) =>
      seed.assignedTemplateApp({ ...input, role, assignedBy: google.ownerUserId }),
    linear,
    google,
    owner,
    service,
    sent,
    employee,
    ivan,
    input,
  };
}
