import { ApplicationError } from "../../../core/applicationError";
import type { ImportedAccount } from "../../../core/connectors";
import type { Tx } from "../../../core/db";
import { createSetupStepService } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import { importSourceRepository } from "../db";
import type { ScanDependencies } from "./scanService";
import { type ScanFindings, syncAccounts } from "./syncAccounts";

const setupSteps = createSetupStepService();

/**
 * Replaces the source's records with what the scan found, syncs them and moves setup on, in one
 * transaction; saves nothing when the scan is no longer queued.
 */
export async function saveScan(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  findings: ScanFindings & {
    revision: string;
    rosterRevision: number | null;
  },
): Promise<{ saved: boolean; finishedSetupScan: boolean; accountsSetToService: number } | null> {
  const { sourceId, accounts, rosterRevision } = findings;
  return dependencies.transact(async (tx) => {
    const sources = importSourceRepository(tx);
    const source = await sources.lockById(sourceId);
    if (source?.status !== "scanning") {
      return { saved: false, finishedSetupScan: false, accountsSetToService: 0 };
    }
    // Before the directory locks any employee, so two saves wait for each other, never deadlock.
    await dependencies.apps.holdAccountSyncs(ctx, tx);
    if (
      findings.connector.isDirectory &&
      !(await dependencies.apps.holdConnectionRevision(
        tx,
        findings.connection.id,
        findings.revision,
      ))
    ) {
      // The job retries from a fresh connection; stale findings must never reach app history.
      throw new ApplicationError("CONFLICT", "The directory connection changed during the scan.");
    }
    // Membership changes and scans share the account sync lock.
    if (
      rosterRevision !== null &&
      rosterRevision !== (await dependencies.apps.readRosterRevision(tx, findings.connection.id))
    )
      return null;
    await sources.replaceRecords(sourceId, accounts);
    if (findings.connector.isDirectory) {
      await followIntegrationUser(ctx, tx, dependencies, { sourceId, accounts });
    }
    const { accountsSetToService } = await syncAccounts(ctx, tx, findings, dependencies);
    await sources.markScanned(sourceId, new Date());
    if (!source.readAt)
      tx.publish("imports.appScanned", { appId: findings.connection.appId, sourceId });
    // Setup waits for the directory's people; another app's scan never ends its scan step.
    const finishedSetupScan =
      findings.connector.isDirectory && (await setupSteps.finishScanStep(ctx, tx));
    return { saved: true, finishedSetupScan, accountsSetToService };
  });
}

/** Lets the connections made by the integration user's sign-in follow its status in the directory. */
async function followIntegrationUser(
  ctx: SecurityContext,
  tx: Tx,
  { integrationUser, apps }: ScanDependencies,
  { sourceId, accounts }: { sourceId: string; accounts: readonly ImportedAccount[] },
): Promise<void> {
  const googleId = await integrationUser.readGoogleUserId(ctx, tx);
  const member = accounts.find(({ sourceKey }) => sourceKey === googleId);
  // Until the directory lists the integration user, nothing is known of it.
  if (member) {
    const suspended = member.values.status === "suspended";
    await apps.syncIntegrationUserStops(ctx, tx, { suspended, ref: sourceId });
  }
}
