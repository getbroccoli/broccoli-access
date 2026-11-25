import type { Orm } from "../../src/core/db";
import { googleScanSetup } from "./googleScanSetup";
import { apps } from "./services";
import { OWNER, SYSTEM } from "./testSecurityContext";

export const ACME_DEMO_APPS = ["Slack", "Notion", "Figma", "Miro", "Loom", "Claude"];

/** Scans Acme and finishes setup with the fixture's demo apps approved. */
export async function approvedGoogleSetup(orm: Orm, googleUrl: string) {
  const { scans, sourceId } = await googleScanSetup(orm, googleUrl);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);
  const { edges } = await service.listApps(OWNER, { status: "discovered" });
  const approvedAppIds = edges
    .filter(({ node }) => ACME_DEMO_APPS.includes(node.name))
    .map(({ node }) => node.id);
  await service.finishSetup(OWNER, { approvedAppIds });
}
