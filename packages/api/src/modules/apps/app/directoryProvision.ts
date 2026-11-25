import { randomBytes } from "node:crypto";

import { ApplicationError } from "../../../core/applicationError";
import {
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  withConnectorRetries,
} from "../../../core/connectors";
import type { Transact, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import {
  accountChangeRepository,
  appAccountRepository,
  appConnectionRepository,
  directoryChangeRepository,
} from "../db";
import type { AccountChange } from "../domain";
import type { AccountChangeDependencies } from "./accountChangeService";
import { firstPasswordCutoff, requirePersonOwner } from "./addPersonService";
import { createAppConnectionService } from "./appConnectionService";
import { findDirectoryConnection } from "./directory";

export interface DirectoryProvisionJob {
  changeId: string;
  appIds: readonly string[];
}

/** Queues the directory invite alone. Its job keeps the owner's other confirmed apps. */
export async function startDirectoryProvision(
  { directoryConnectors, jobs }: AccountChangeDependencies,
  tx: Tx,
  request: {
    employee: { id: string; email: string };
    appIds: readonly string[];
    requestedBy: string;
  },
): Promise<AccountChange[]> {
  const { employee, appIds, requestedBy } = request;
  const connection = await findDirectoryConnection(tx, directoryConnectors);
  if (!connection) throw new ApplicationError("CONFLICT", "Google Workspace is not connected.");
  if (
    (
      await appAccountRepository(tx).findEmployeeIdsWithStatus(connection.appId, null, [
        employee.id,
      ])
    ).length
  )
    return [];
  const invites = await directoryChangeRepository(tx).findLatest([employee.id], connection.id);
  const latest = invites.get(employee.id);
  if (latest && latest.status !== "failed") return [];
  const change = await accountChangeRepository(tx).insertRunning({
    action: "invite",
    appAccountId: null,
    appId: connection.appId,
    connectionId: connection.id,
    email: employee.email,
    role: null,
    sourceKey: null,
    requestedBy,
    requestedAt: new Date(),
    startedFrom: "provision",
    employeeId: employee.id,
  });
  if (!change) return [];
  await jobs.send(
    tx,
    "apps.runDirectoryProvision",
    { changeId: change.id, appIds },
    { group: connection.id },
  );
  return [change];
}

export type SaveDirectoryOutcome = (tx: Tx) => Promise<boolean>;

/** Creates the account, recording success in the transaction that releases the confirmed apps. */
export async function runDirectoryProvision(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  { changeId, appIds }: DirectoryProvisionJob,
  release: (
    change: AccountChange,
    connectors: readonly Connector[],
    save?: SaveDirectoryOutcome,
  ) => Promise<void>,
): Promise<void> {
  ctx.requireSystem();
  const { orm, logger, transact } = dependencies;
  const change = await accountChangeRepository(orm).findById(changeId);
  if (!change?.connectionId || !change.employeeId) return;
  if (change.status !== "running" && change.status !== "succeeded") return;
  const connectors = await requireProvisionConnectors(dependencies, appIds);
  // A retried job can release the remaining apps after the directory outcome committed.
  if (change.status === "succeeded") return release(change, connectors);

  const first = await firstPasswordFor(dependencies, change);
  // Another delivery has finished the change.
  if (!first) return;
  const failure = await createDirectoryAccount(dependencies, ctx, connectors, change, first);
  const finishedAt = new Date();
  const save: SaveDirectoryOutcome = async (tx) => {
    const changes = accountChangeRepository(tx);
    if ((await changes.lockById(changeId))?.status !== "running") return false;
    await changes.finish(changeId, {
      status: failure ? "failed" : "succeeded",
      attempts: [{ runtime: "server", error: failure, at: finishedAt }],
      error: failure,
      finishedAt,
    });
    return true;
  };
  const ids = {
    changeId,
    employeeId: change.employeeId,
    connectionId: change.connectionId,
  };
  if (failure) {
    const finished = await transact(save);
    logger.warn({ ...ids, failure, finished }, "Directory account creation failed");
    return;
  }
  await releaseCreatedDirectoryAccount(transact, save, () => release(change, connectors, save));
  logger.info(ids, "Directory account created");
}

/**
 * The person's first password and whether an earlier try sent it: this change's own, stored before
 * Google saw it, else the one an earlier try of theirs stored, else a new one. A failed try keeps
 * its password for the next, and only a created account's can be revealed. Null once this change
 * no longer runs, as after another delivery finished it.
 */
async function firstPasswordFor(
  { transact, secretBox }: AccountChangeDependencies,
  change: AccountChange,
): Promise<FirstPassword | null> {
  return transact(async (tx) => {
    if ((await accountChangeRepository(tx).lockById(change.id))?.status !== "running") return null;
    const passwords = directoryChangeRepository(tx);
    const own = await passwords.readFirstPassword(change.id);
    if (own) return { password: secretBox.decrypt(own, change.id), sentBefore: true };
    const earlier = await passwords.findEarlierFirstPassword(
      change.employeeId!,
      change.connectionId!,
      change.id,
    );
    const password = earlier
      ? secretBox.decrypt(earlier.encrypted, earlier.id)
      : randomBytes(FIRST_PASSWORD_BYTES).toString("base64url");
    await passwords.saveFirstPassword(change.id, secretBox.encrypt(password, change.id));
    return { password, sentBefore: earlier !== null };
  });
}

interface FirstPassword {
  password: string;
  /** Whether an earlier try sent it, so the account that try created may exist already. */
  sentBefore: boolean;
}

/** 256 bits: no one guesses the first password before the person changes it. */
const FIRST_PASSWORD_BYTES = 32;

/** Keep the job retryable before asking Google to create the account. */
async function requireProvisionConnectors(
  { connectors, orm }: AccountChangeDependencies,
  appIds: readonly string[],
) {
  const [listed, connections] = await Promise.all([
    connectors.list(),
    appConnectionRepository(orm).findByApps(appIds),
  ]);
  if (connections.some(({ connector }) => !listed.some(({ key }) => key === connector))) {
    throw new ApplicationError("UNAVAILABLE", "A confirmed app's connector is unavailable.");
  }
  return listed;
}

/** An app failure rolls the handoff back. Keep Google's confirmed outcome for a safe retry. */
async function releaseCreatedDirectoryAccount(
  transact: Transact,
  save: SaveDirectoryOutcome,
  release: () => Promise<void>,
) {
  try {
    await release();
  } catch (error) {
    await transact(save);
    throw error;
  }
}

export async function takeFirstPassword(
  { directoryConnectors, transact, secretBox, logger }: AccountChangeDependencies,
  ctx: SecurityContext,
  employeeId: string,
): Promise<{ email: string; password: string } | null> {
  requirePersonOwner(ctx);
  const id = parseUuid(employeeId);
  if (!id) return null;
  const result = await transact(async (tx) => {
    const directory = await findDirectoryConnection(tx, directoryConnectors);
    if (!directory) return null;
    const stored = await directoryChangeRepository(tx).takeFirstPassword(
      id,
      directory.id,
      firstPasswordCutoff(),
    );
    return (
      stored && {
        changeId: stored.id,
        email: stored.email,
        password: secretBox.decrypt(stored.encrypted, stored.id),
      }
    );
  });
  if (result) logger.info({ employeeId: id, changeId: result.changeId }, "First password shown");
  return result && { email: result.email, password: result.password };
}

export async function expireFirstPasswords(
  { orm }: AccountChangeDependencies,
  ctx: SecurityContext,
): Promise<void> {
  ctx.requireSystem();
  await directoryChangeRepository(orm).expireFirstPasswords(firstPasswordCutoff());
}

async function createDirectoryAccount(
  { employees, orm, secretBox, wait, logger }: AccountChangeDependencies,
  ctx: SecurityContext,
  connectors: readonly Connector[],
  change: AccountChange,
  first: FirstPassword,
): Promise<ConnectorErrorCode | null> {
  const [person] = await employees.readEmployees(ctx, [change.employeeId!]);
  if (!person || person.email !== change.email) return "account_not_found";
  const connections = createAppConnectionService({ secretBox });
  const stored = await connections.readConnectionWithSecrets(orm, change.connectionId!);
  const directory = connectors.find(
    ({ key, isDirectory }) => isDirectory && key === stored?.connection.connector,
  );
  if (!directory || !stored) return "app_unavailable";
  try {
    const session = await directory.openSession({
      settings: stored.connection.settings,
      secrets: stored.secrets,
    });
    if (!session.createDirectoryAccount) return "app_unavailable";
    // A duplicate address can belong to an account created elsewhere; the person's id as the key
    // tells an earlier try's account apart. Only a confirmed creation releases the other apps.
    let { sentBefore } = first;
    const create = () => {
      const attempt = { ...person, key: change.employeeId!, password: first.password, sentBefore };
      // A retried call may follow one whose answer was lost after Google created the account.
      sentBefore = true;
      return session.createDirectoryAccount!(attempt);
    };
    await withConnectorRetries(create, {
      wait,
      onRetry: (failure, attempt) =>
        logger.info(
          { changeId: change.id, failure, attempt },
          "Directory account creation will retry",
        ),
    });
    return null;
  } catch (error) {
    if (error instanceof ConnectorError) return error.code;
    throw error;
  }
}
