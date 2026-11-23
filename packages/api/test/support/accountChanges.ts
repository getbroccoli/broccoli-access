import assert from "node:assert/strict";

import type { AccountStatus, ListedAccount } from "@broccoli-access/connector-contract";
import { ACME_LINEAR, type SeedMember } from "@broccoli-access/fake-apps";

import type { Orm, Transact } from "../../src/core/db";
import type { JobQueue } from "../../src/core/jobs";
import { createLogger } from "../../src/core/logger";
import { createAccountChangeService } from "../../src/modules/apps";
import { createGoogleWorkspaceConnector } from "../../src/modules/google";
import { createImportRecordService } from "../../src/modules/imports";
import { connectLinear, containerConnectors } from "./containerConnections";
import { recordingJobQueue } from "./recordingJobQueue";
import { storedAppAccounts } from "./storedScan";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { SYSTEM } from "./testSecurityContext";
import { testTransactor } from "./testTransactor";

export function accountChanges(
  orm: Orm,
  {
    connectorsUrl,
    jobs = recordingJobQueue().jobs,
    transact = testTransactor(orm),
  }: { connectorsUrl?: string; jobs?: JobQueue; transact?: Transact } = {},
) {
  const container = containerConnectors(connectorsUrl);
  const google = createGoogleWorkspaceConnector({
    openIdConfigurationUrl: "http://127.0.0.1:9/.well-known/openid-configuration",
    adminApiUrl: "http://127.0.0.1:9",
  });
  const connectors = { list: async () => [google, ...(await container.list())] };
  return createAccountChangeService({
    orm,
    transact,
    jobs,
    connectors,
    members: createImportRecordService(),
    secretBox: TEST_SECRET_BOX,
    logger: createLogger("silent"),
    wait: () => Promise.resolve(),
  });
}

export async function scannedLinear(orm: Orm, url: string) {
  const linear = await connectLinear(orm, url);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const accounts = (await storedAppAccounts(orm)).filter(({ appId }) => appId === linear.appId);
  return {
    ...linear,
    account(email: string) {
      const account = accounts.find((account) => account.email === email);
      assert(account, `No Linear account with email ${email}`);
      return account;
    },
  };
}

export async function linearMemberStatus(url: string, email: string) {
  const response = await fetch(`${url}/_fake/state`);
  assert.equal(response.status, 200);
  const state = (await response.json()) as { linear: Pick<SeedMember, "email" | "status">[] };
  const member = state.linear.find((member) => member.email === email);
  assert(member);
  return member.status;
}

export function listedLinearChloe(status: AccountStatus): ListedAccount {
  const { sourceKey, email, displayName, isConnectionUser } = ACME_LINEAR.members.find(
    (member) => member.email === "chloe@acme.example",
  )!;
  return { sourceKey, raw: {}, values: { email, displayName, isConnectionUser, status } };
}
