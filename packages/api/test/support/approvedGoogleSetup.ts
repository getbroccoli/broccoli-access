import type { Orm } from "../../src/core/db";
import { googleScanSetup } from "./googleScanSetup";
import { apps } from "./services";
import { OWNER, SYSTEM } from "./testSecurityContext";

/** Scans Acme and finishes setup with its preselected apps approved. */
export async function approvedGoogleSetup(orm: Orm, googleUrl: string) {
  const { scans, sourceId } = await googleScanSetup(orm, googleUrl);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);
  const { edges } = await service.listApps(OWNER, { status: "discovered" });
  const approvedAppIds = edges.filter(({ node }) => node.preselected).map(({ node }) => node.id);
  await service.finishSetup(OWNER, { approvedAppIds });
}
