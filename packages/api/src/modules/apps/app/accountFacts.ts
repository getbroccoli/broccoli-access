import { ApplicationError } from "../../../core/applicationError";
import {
  canChangeAccounts,
  canRemoveAccounts,
  type AccountAction,
  type Connector,
  type ConnectorRegistry,
} from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { parseUuid } from "../../../utils";
import type { SecurityContext } from "../../../core/security";
import {
  type AppConnection,
  appAccountRepository,
  accountChangeRepository,
  appConnectionRepository,
} from "../db";
import {
  type AccountChange,
  type AccountChangeAction,
  type AppAccount,
  isAutomaticService,
  offeredChange,
  offersReconnect,
  offersRemove,
} from "../domain";
import type { ConnectionMember } from "../ports";
import type { AccountChangeDependencies } from "./accountChangeService";

/** The common authorised read behind the offer and the full account-change state. */
export async function readChangeFacts(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  db: Orm | Tx,
  ids: readonly string[],
  connectors?: readonly Connector[],
) {
  ctx.require("MANAGE_WORKSPACE");
  const accounts = await appAccountRepository(db).findByIds(
    ids.flatMap((id) => parseUuid(id) ?? []),
  );
  return readAccountFacts(
    dependencies,
    db,
    accounts,
    connectors && changingConnectorsOf(connectors),
  );
}

/** What decides each account's Disable or Enable, by account id, read in one go. */
export async function readAccountFacts(
  dependencies: AccountChangeDependencies,
  db: Orm | Tx,
  accounts: readonly AppAccount[],
  changing?: ChangingConnectors,
): Promise<Map<string, AccountFacts>> {
  const stored = await readFacts(dependencies, db, accounts);
  // The connector list can take a network round trip. No member means no action.
  const capabilities =
    changing ??
    (stored.members.length ? await changingConnectors(dependencies.connectors) : NO_CONNECTORS);
  return gatherFacts(accounts, stored, capabilities);
}

/** What the accounts' offers are decided from: their apps' connections, members and latest changes. */
interface StoredFacts {
  connections: AppConnection[];
  members: ConnectionMember[];
  latest: AccountChange[];
  /** The integration user's email in apps; null while nothing tells which accounts are its own. */
  integrationEmail: string | null;
}

async function readFacts(
  { members, integrationUser }: AccountChangeDependencies,
  db: Orm | Tx,
  accounts: readonly AppAccount[],
): Promise<StoredFacts> {
  const [connections, latest, integrationEmail] = await Promise.all([
    appConnectionRepository(db).findByApps(accounts.map(({ appId }) => appId)),
    accountChangeRepository(db).findLatestOfAccounts(accounts.map(({ id }) => id)),
    integrationUser.findIntegrationAccountEmail(db),
  ]);
  const found = await members.findConnectionMembers(db, {
    connectionIds: connections.map(({ id }) => id),
    emails: accounts.map(({ email }) => email),
  });
  return { connections, members: found, latest, integrationEmail };
}

/** What decides each account's offer: its app's connection, the connection's member and its latest change. */
export interface AccountFacts {
  connection: AppConnection | null;
  /** Whether a member with the account's email is the connection's own user. */
  isConnectionUser: boolean;
  /** Null when the connection's last scan has no member with the account's email, or several. */
  member: ConnectionMember | null;
  latest: AccountChange | null;
  offered: AccountAction | null;
  offersRemove: boolean;
  /** Whether Reconnect shows instead of Disable or Enable. */
  reconnectOffered: boolean;
}

function gatherFacts(
  accounts: readonly AppAccount[],
  { connections, members, latest, integrationEmail }: StoredFacts,
  changing: ChangingConnectors,
): Map<string, AccountFacts> {
  const connectionByApp = new Map(connections.map((connection) => [connection.appId, connection]));
  const membersByKey = Map.groupBy(
    members,
    ({ connectionId, email }) => `${connectionId} ${email}`,
  );
  const latestByAccount = new Map(latest.map((change) => [change.appAccountId, change]));
  return new Map(
    accounts.map((account) => {
      const connection = connectionByApp.get(account.appId) ?? null;
      const matches = connection
        ? membersByKey.get(`${connection.id} ${account.email}`)
        : undefined;
      // Two members sharing the email leave the change's target unclear.
      const member = matches?.length === 1 ? matches[0]! : null;
      const isConnectionUser = matches?.some((match) => match.isConnectionUser) ?? false;
      const change = latestByAccount.get(account.id) ?? null;
      // Whatever the owner marked it as: a change would lock Broccoli Access out of the app.
      const isIntegrationUsers = isAutomaticService(account) || account.email === integrationEmail;
      const offerFacts = {
        status: account.status,
        connection: connection && {
          status: connection.status,
          changesAccounts: changing.status.has(connection.connector),
          removesAccounts:
            changing.remove.has(connection.connector) &&
            (member?.status === "suspended" || disabledHere(change, member)),
        },
        record: member && !isIntegrationUsers ? { isConnectionUser } : null,
        changeRunning: change?.status === "running",
      };
      return [
        account.id,
        {
          connection,
          isConnectionUser,
          member,
          latest: latestForMember(change, member),
          offersRemove: offersRemove(offerFacts),
          offered: offeredChange(offerFacts),
          reconnectOffered: offersReconnect(offerFacts),
        },
      ];
    }),
  );
}

export interface ChangingConnectors {
  status: Set<string>;
  remove: Set<string>;
}

const NO_CONNECTORS: ChangingConnectors = { status: new Set(), remove: new Set() };

/** Connector keys grouped by the changes they can make. */
export async function changingConnectors(
  connectors: ConnectorRegistry,
): Promise<ChangingConnectors> {
  return changingConnectorsOf(await connectors.list());
}

function changingConnectorsOf(listed: readonly Connector[]): ChangingConnectors {
  return {
    status: new Set(listed.filter(canChangeAccounts).map(({ key }) => key)),
    remove: new Set(listed.filter(canRemoveAccounts).map(({ key }) => key)),
  };
}

/** A Disable the connector verified for this member, which no scan has saved as suspended yet. */
function disabledHere(change: AccountChange | null, member: ConnectionMember | null): boolean {
  return (
    change?.action === "suspend" &&
    change.status === "succeeded" &&
    change.sourceKey === member?.sourceKey
  );
}

function latestForMember(
  change: AccountChange | null,
  member: ConnectionMember | null,
): AccountChange | null {
  if (
    change?.status === "failed" &&
    change.action === "remove" &&
    member &&
    member.sourceKey !== change.sourceKey
  )
    return null;
  return change;
}

/** Refuses a retry of a failed Remove once the account's facts no longer match that change. */
export function ensureSameRetry(
  { latest, member, connection }: AccountFacts,
  action: AccountChangeAction,
  retryOf: string,
): void {
  if (
    action !== "remove" ||
    latest?.id !== retryOf ||
    latest.action !== action ||
    latest.status !== "failed" ||
    latest.error === "not_allowed" ||
    member?.sourceKey !== latest.sourceKey ||
    connection?.id !== latest.connectionId
  ) {
    throw new ApplicationError(
      "CONFLICT",
      "This removal can no longer be retried. Check the current member and confirm a new removal.",
    );
  }
}
