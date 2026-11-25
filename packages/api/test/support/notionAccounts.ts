import { onTestFinished } from "vitest";

import {
  NOTION_CONNECTION,
  startNotionConnector,
  type NotionAction,
} from "../../../fake-apps/test/support/notionConnector";
import type { Orm } from "../../src/core/db";
import { accountChanges } from "./accountChanges";
import { containerConnections } from "./containerConnections";
import { storedAppAccounts, storedImportSources } from "./storedScan";
import { OWNER, SYSTEM } from "./testSecurityContext";

export const NOTION_INPUT = {
  connector: "notion",
  values: [{ key: "apiKey", value: NOTION_CONNECTION.secrets.apiKey }],
};

export async function testNotion(actions: readonly NotionAction[]) {
  const notion = await startNotionConnector(actions);
  onTestFinished(notion.stop);
  return notion;
}

export async function scannedNotion(orm: Orm, actions: readonly NotionAction[]) {
  const { url } = await testNotion(actions);
  const { service, scans } = containerConnections(orm, url);
  const { connection } = await service.connect(OWNER, NOTION_INPUT);
  const source = (await storedImportSources(orm)).find(
    ({ connectionId }) => connectionId === connection!.id,
  )!;
  await scans.runScan(SYSTEM, source.id);
  const accounts = await storedAppAccounts(orm);
  const chloe = accounts.find(
    ({ email, foundVia }) => email === "chloe@acme.example" && foundVia.includes("notion_members"),
  )!;
  const own = accounts.find(
    ({ appId, email }) => appId === chloe.appId && email === "david@acme.example",
  )!;
  return { changes: accountChanges(orm, { connectorsUrl: url }), chloe, own };
}
