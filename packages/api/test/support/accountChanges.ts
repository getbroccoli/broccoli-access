import assert from "node:assert/strict";

import type { AccountStatus, ListedAccount } from "@broccoli-access/connector-contract";
import { ACME_LINEAR, type SeedMember } from "@broccoli-access/fake-apps";

import type { ConnectorRegistry } from "../../src/core/connectors";
import type { Orm, Transact } from "../../src/core/db";
import type { JobQueue } from "../../src/core/jobs";
import { createLogger } from "../../src/core/logger";
import { createAccountChangeService } from "../../src/modules/apps";
import { createEmployeeReadService } from "../../src/modules/employees";
import { createGoogleWorkspaceConnector } from "../../src/modules/google";
import { createImportRecordService } from "../../src/modules/imports";
import { connectLinear, containerConnectors, failLinearCall } from "./containerConnections";
import { recordingJobQueue } from "./recordingJobQueue";
import { apps } from "./services";
import { storedAppAccounts } from "./storedScan";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { SYSTEM } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";
import { testTransactor } from "./testTransactor";

export function accountChanges(
  orm: Orm,
  {
    connectorsUrl,
    connectors: suppliedConnectors,
    jobs = recordingJobQueue().jobs,
    transact = testTransactor(orm),
  }: {
    connectors?: ConnectorRegistry;
    connectorsUrl?: string;
    jobs?: JobQueue;
    transact?: Transact;
  } = {},
) {
  const container = suppliedConnectors ?? containerConnectors(connectorsUrl);
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
    employees: createEmployeeReadService({ orm, accounts: apps(orm) }),
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

export async function pendingDisable(orm: Orm, seed: TestSeed, url: string) {
  const linear = await scannedLinear(orm, url);
  const chloe = linear.account("chloe@acme.example");
  const owner = await seed.owner();
  const service = accountChanges(orm, { connectorsUrl: url });
  const change = await service.changeAccount(owner, { appAccountId: chloe.id, action: "suspend" });
  const latest = async () =>
    (await service.readChangeStates(owner, [chloe.id])).get(chloe.id)?.latestChange;
  return { linear, service, chloe, owner, change, latest };
}

export async function failedDisable(orm: Orm, seed: TestSeed, url: string) {
  const pending = await pendingDisable(orm, seed, url);
  await failLinearCall(url, "actions/run", "unexpected_response");
  await pending.service.runChange(SYSTEM, pending.change.id);
  return pending;
}
