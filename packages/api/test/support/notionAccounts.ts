import { onTestFinished } from "vitest";

import {
  NOTION_CONNECTION,
  startNotionConnector,
  type NotionAction,
} from "@broccoli-access/fake-apps/test/support";
import type { Orm } from "../../src/core/db";
import { accountChanges } from "./accountChanges";
import { containerConnections } from "./containerConnections";
import { googleScanSetup } from "./googleScanSetup";
import { storedAppConnections } from "./storedGoogleConnection";
import { storedAppAccounts, storedEmployees, storedImportSources } from "./storedScan";
import { OWNER, SYSTEM } from "./testSecurityContext";

export const NOTION_INPUT = {
  connector: "notion",
  values: [{ key: "apiKey", value: NOTION_CONNECTION.secrets.apiKey }],
};

export async function testNotion(actions: readonly NotionAction[], { instantInvite = false } = {}) {
  const notion = await startNotionConnector(actions, undefined, { instantInvite });
  onTestFinished(notion.stop);
  return notion;
}

export async function scannedNotion(
  orm: Orm,
  actions: readonly NotionAction[],
  googleUrl?: string,
) {
  const { url, scans, sourceId } = await connectNotion(orm, actions);
  await scans.runScan(SYSTEM, sourceId);
  const accounts = await storedAppAccounts(orm);
  const chloe = accounts.find(
    ({ email, foundVia }) => email === "chloe@acme.example" && foundVia.includes("notion_members"),
  )!;
  const own = accounts.find(
    ({ appId, email }) => appId === chloe.appId && email === "david@acme.example",
  )!;
  return { changes: accountChanges(orm, { connectorsUrl: url, googleUrl }), chloe, own };
}

export async function instantNotionInvite(orm: Orm, googleUrl: string) {
  const google = await googleScanSetup(orm, googleUrl);
  await google.scans.runScan(SYSTEM, google.sourceId);
  const notion = await connectNotion(orm, ["invite"], { instantInvite: true });
  await notion.scans.runScan(SYSTEM, notion.sourceId);
  const ivan = (await storedEmployees(orm)).find(({ email }) => email === "ivan@acme.example")!;
  const input = { employeeId: ivan.id, appId: notion.appId };
  const changes = accountChanges(orm, { connectorsUrl: notion.url, googleUrl });
  return { ...notion, owner: google.owner, ivan, input, changes };
}

async function connectNotion(
  orm: Orm,
  actions: readonly NotionAction[],
  options?: { instantInvite?: boolean },
) {
  const { url } = await testNotion(actions, options);
  const { service, scans } = containerConnections(orm, url);
  const { connection } = await service.connect(OWNER, NOTION_INPUT);
  const connectionId = connection!.id;
  const { appId } = (await storedAppConnections(orm)).find(({ id }) => id === connectionId)!;
  const source = (await storedImportSources(orm)).find((row) => row.connectionId === connectionId)!;
  return { url, scans, connectionId, appId, sourceId: source.id };
}
