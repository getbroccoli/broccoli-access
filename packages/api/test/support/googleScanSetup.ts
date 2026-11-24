import assert from "node:assert/strict";

import type { Orm } from "../../src/core/db";
import type { JobQueue } from "../../src/core/jobs";
import { consentAtGoogle } from "./googleConsent";
import { googleSetup } from "./googleSetup";
import { scans } from "./services";
import { storedAppConnections } from "./storedGoogleConnection";
import { storedImportSources } from "./storedScan";
import { grantAtFakeGoogle } from "./fakeGoogleControls";
import { SETUP_HOLDER, SYSTEM } from "./testSecurityContext";

/** Completes real consent, leaving its first scan queued for the test to run. */
export async function googleScanSetup(orm: Orm, googleUrl: string, jobs?: JobQueue) {
  const { connection, input } = await googleSetup(orm, googleUrl, { jobs });
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl);
  const { userId } = await connection.finishConsent(SETUP_HOLDER, {
    ...input,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });
  const [saved] = await storedAppConnections(orm);
  const [source] = await storedImportSources(orm);
  assert(saved);
  assert(source);
  return {
    ownerUserId: userId,
    connectionId: saved.id,
    sourceId: source.id,
    scans: scans(orm, { googleUrl, jobs }),
  };
}

/** Finishes a Google scan after the fake grants one person access to Linear. */
export async function googleScanWithLinearGrant(orm: Orm, googleUrl: string, email: string) {
  await grantAtFakeGoogle(googleUrl, { email, clientId: "linear-client", appName: "Linear" });
  const google = await googleScanSetup(orm, googleUrl);
  await google.scans.runScan(SYSTEM, google.sourceId);
  return google;
}
