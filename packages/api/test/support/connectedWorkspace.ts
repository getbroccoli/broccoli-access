import type { Orm } from "../../src/core/db";
import { PrincipalSecurityContext } from "../../src/core/security";
import { employeeDirectory } from "../../src/modules/employees";
import { registerGoogleRedirect } from "./googleConsent";
import { googleScanSetup } from "./googleScanSetup";
import { googleConnection, scans as createScans } from "./services";
import { instances } from "./statelessServices";
import { storedUsers, storedGoogleAccounts } from "./storedGoogleConnection";
import {
  storedApps,
  storedEmployees,
  storedAppAccounts,
  storedImportSources,
  storedImportRecords,
} from "./storedScan";
import { SYSTEM } from "./testSecurityContext";

export async function connectedWorkspace(orm: Orm, googleUrl: string, relayUrl?: string) {
  const { ownerUserId, connectionId, sourceId } = await googleScanSetup(orm, googleUrl);
  const scans = createScans(orm, { googleUrl, relayUrl });
  await scans.runScan(SYSTEM, sourceId);
  const ctx = PrincipalSecurityContext.user(
    {
      userId: ownerUserId,
      email: "admin@acme.example",
      isOwner: true,
      permissionProfiles: ["EMPLOYEE", "OWNER"],
      employeeId: null,
    },
    employeeDirectory(orm),
  );
  const input = {
    clientId: "replacement-google-client",
    clientSecret: "replacement-google-secret",
    publicOrigin: "http://localhost:3000",
    now: new Date("2026-11-21T12:00:00Z"),
  };
  await registerGoogleRedirect(googleUrl, input.publicOrigin, input);
  return {
    connection: googleConnection(orm, { googleUrl, relayUrl }),
    ctx,
    input,
    connectionId,
    ownerUserId,
    scans,
    sourceId,
  };
}

export async function storedWorkspace(orm: Orm) {
  return {
    instance: await instances.readInstance(orm),
    users: await storedUsers(orm),
    googleAccounts: await storedGoogleAccounts(orm),
    apps: await storedApps(orm),
    people: await storedEmployees(orm),
    appAccounts: await storedAppAccounts(orm),
    sources: await storedImportSources(orm),
    records: await storedImportRecords(orm),
  };
}
