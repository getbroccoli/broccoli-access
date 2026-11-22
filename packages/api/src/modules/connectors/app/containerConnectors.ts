import type { ConnectorDescription, ListedAccount } from "@broccoli-access/connector-contract";
import { z } from "zod";

import {
  type ConnectionField,
  type ConnectionUpdate,
  type Connector,
  ConnectorError,
  type ConnectorSession,
  type ImportedAccount,
} from "../../../core/connectors";
import { ApplicationError } from "../../../core/applicationError";
import type { Logger } from "../../../core/logger";
import {
  type ConnectorsContainerClient,
  type ContainerAnswer,
  createConnectorsContainerClient,
} from "../../../integrations/connectorsContainer";

/** The connectors container's connectors, read from its list. */
export interface ContainerConnectors {
  /**
   * Its connectors; none without a container. Reads its list on the first call and keeps it; while
   * the container does not answer, logs it, lists none and reads again on the next call.
   */
  list(): Promise<readonly ContainerConnector[]>;
  /** The listed connector with `key`; refuses one the container does not list with NOT_FOUND. */
  find(key: string): Promise<ContainerConnector>;
}

/** A connector of the connectors container: the core shows and runs it with no code for its app. */
export interface ContainerConnector extends Connector {
  /** Such as `linear.app`. */
  appDomain: string;
  /** Shown before the first connection; null for an API connector. */
  notice: string | null;
  /** Where the owner manages the app's members; its `{placeholders}` name settings. */
  adminUrl: string;
  connectionFields: readonly ContainerConnectionField[];
}

/** A value connecting asks for: text the owner types or pastes, or their app session. */
type ContainerConnectionField = ConnectionField & {
  label: string;
  help: string;
} & ({ kind: "text" } | AppSessionField);

/** The owner's app session, which the extension collects from their Chrome. */
export interface AppSessionField {
  kind: "app_session";
  /** Whose cookies the extension hands over: these domains and their subdomains. */
  domains: readonly string[];
  /** The local storage keys of the app's signed-in page whose values it hands over. */
  storageKeys: readonly string[];
}

export function createContainerConnectors({
  url,
  logger,
}: {
  /** `CONNECTORS_URL`; unset means no container. */
  url: string | undefined;
  logger: Logger;
}): ContainerConnectors {
  if (!url) {
    return withFind({ list: () => Promise.resolve([]) });
  }
  const client = createConnectorsContainerClient(url);
  // shortcut: while the container is down, each read asks it again; throttle these reads if a
  // container that stays down ever slows the pages that list connectors.
  let connectors: Promise<readonly ContainerConnector[]> | undefined;
  return withFind({
    list() {
      connectors ??= client.readConnectors().then(
        (descriptions) => {
          const usable = descriptions.filter(hasDistinctFieldKeys);
          logger.info(
            {
              connectors: usable.map(({ key }) => key),
              leftOut: descriptions
                .filter((description) => !usable.includes(description))
                .map(({ key }) => key),
            },
            "Connectors container listed its connectors",
          );
          return usable.map((description) => containerConnector(description, client));
        },
        (error: unknown) => {
          connectors = undefined;
          logger.warn(
            { kind: error instanceof Error ? error.name : typeof error },
            "Connectors container did not list its connectors; reading again on the next request",
          );
          return [];
        },
      );
      return connectors;
    },
  });
}

/**
 * The connection field of the owner's app session; undefined for a connector of typed values.
 * shortcut: a connector connects with one app session or with typed values, as both of v1's do;
 * mixing them needs the typed values beside the session.
 */
export function appSessionFieldOf(
  connector: ContainerConnector,
): (AppSessionField & { key: string }) | undefined {
  return connector.connectionFields.find((field) => field.kind === "app_session");
}

/** The listed connector with `key` and its app session field; refuses one without with CONFLICT. */
export async function findAppSessionConnector(
  containerConnectors: ContainerConnectors,
  key: string,
): Promise<{ connector: ContainerConnector; field: AppSessionField & { key: string } }> {
  const connector = await containerConnectors.find(key);
  const field = appSessionFieldOf(connector);
  if (!field) {
    throw new ApplicationError(
      "CONFLICT",
      "This connector connects with typed values, not an app session.",
    );
  }
  return { connector, field };
}

function withFind(connectors: Pick<ContainerConnectors, "list">): ContainerConnectors {
  return {
    ...connectors,
    async find(key) {
      const connector = (await connectors.list()).find((candidate) => candidate.key === key);
      if (!connector) {
        throw new ApplicationError(
          "NOT_FOUND",
          "The connectors container has no connector with this key.",
        );
      }
      return connector;
    },
  };
}

/**
 * Whether each connection field has its own key; a repeated key could put a secret value in the
 * plain settings, so such a connector is left out.
 */
function hasDistinctFieldKeys({ connectionFields }: ConnectorDescription): boolean {
  return new Set(connectionFields.map(({ key }) => key)).size === connectionFields.length;
}

/** Settings and secrets only the container reads. */
const OPAQUE = z.record(z.string(), z.unknown());

/** Every call in circle 2 runs in the container by itself. */
const SERVER = { kind: "server" } as const;

function containerConnector(
  description: ConnectorDescription,
  client: ConnectorsContainerClient,
): ContainerConnector {
  const { key, version, name, appDomain, capabilities, runtimes, notice, adminUrl } = description;
  return {
    key,
    version,
    name,
    appDomain,
    capabilities,
    runtimes,
    notice,
    adminUrl,
    findingKinds: { ownAppAccounts: description.findingKind },
    isDirectory: false,
    connectionFields: description.connectionFields.map(containerConnectionField),
    settings: OPAQUE,
    secrets: OPAQUE,
    openSession: (connection) =>
      Promise.resolve(
        containerSession(description, client, {
          settings: OPAQUE.parse(connection.settings),
          secrets: OPAQUE.parse(connection.secrets),
        }),
      ),
  };
}

function containerConnectionField(
  field: ConnectorDescription["connectionFields"][number],
): ContainerConnectionField {
  const { key, label, help } = field;
  return field.kind === "app_session"
    ? {
        key,
        label,
        help,
        kind: "app_session",
        secret: true,
        domains: field.domains,
        storageKeys: field.storageKeys ?? [],
      }
    : { key, label, help, kind: "text", secret: field.secret };
}

/** Calls the container with the connection, which each answer's `connection` replaces for later calls. */
function containerSession(
  { key, name }: ConnectorDescription,
  client: ConnectorsContainerClient,
  connection: Required<ConnectionUpdate>,
): ConnectorSession {
  let current = connection;
  const request = () => ({ connector: key, connection: current, runtime: SERVER });
  const keep = (update: ConnectionUpdate | undefined) => {
    current = { ...current, ...update };
  };
  return {
    async testConnection() {
      const { details, connection: update } = answerOf(await client.testConnection(request()));
      keep(update);
      return { ...details, connection: update };
    },
    async listAccounts(cursor) {
      const page = answerOf(await client.listAccounts({ ...request(), cursor }));
      keep(page.connection);
      return {
        accounts: page.accounts.map((account) => importedAccount(account, name)),
        nextCursor: page.nextCursor,
        connection: page.connection,
      };
    },
    async runAction(action, account) {
      const answer = answerOf(await client.runAction({ ...request(), action, account }));
      keep(answer.connection);
      // The connector checks the member before acting; an answer about another one is wrong.
      if (answer.account.sourceKey !== account.sourceKey) {
        throw new ConnectorError("unexpected_response");
      }
      return { status: answer.account.values.status, connection: answer.connection };
    },
  };
}

function answerOf<T>(answer: ContainerAnswer<T>): T {
  if ("error" in answer) {
    throw new ConnectorError(answer.error);
  }
  return answer.answer;
}

/** A member as an account of the connection's own app; the container names no other app. */
function importedAccount(
  { sourceKey, raw, values }: ListedAccount,
  appName: string,
): ImportedAccount {
  return {
    sourceKey,
    raw,
    values: {
      email: values.email,
      status: values.status,
      firstName: null,
      lastName: null,
      managerEmail: null,
      appName,
      appExternalId: null,
      grantedAt: null,
      grantedBefore: null,
      isConnectionUser: values.isConnectionUser,
    },
  };
}
