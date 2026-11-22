import { eq, sql } from "drizzle-orm";

import { anyOf, type Orm, ormOf, type Tx } from "../../../core/db";
import { appConnections } from "./appConnectionsTable";

/** A connection as stored, without its secrets. */
export interface AppConnection {
  id: string;
  connector: string;
  appId: string;
  settings: Record<string, unknown>;
  connectedAt: Date;
  /** `reconnect` once its key or session stopped working. */
  status: "connected" | "reconnect";
}

/** App connections in Postgres, through the pool or inside a transaction. */
export interface AppConnectionRepository {
  /** A new connection id, which encrypts the secrets before the insert. */
  newId(): Promise<string>;
  insert(connection: {
    id: string;
    connector: string;
    appId: string;
    settings: Record<string, unknown>;
    encryptedSecrets: string;
  }): Promise<AppConnection>;
  /** Replaces the connection's settings or secrets, whichever is set; null for an unknown id. */
  update(
    id: string,
    connection: { settings?: Record<string, unknown>; encryptedSecrets?: string },
  ): Promise<AppConnection | null>;
  findByConnector(connector: string): Promise<AppConnection | null>;
  /** Every connection; an instance has at most one per connector. */
  findAll(): Promise<AppConnection[]>;
  findById(id: string): Promise<AppConnection | null>;
  /** The connections of the apps `appIds`; an app nobody connected has none. */
  findByApps(appIds: readonly string[]): Promise<AppConnection[]>;
  /** Like `findById`, locking the row until the transaction ends. */
  lockById(id: string): Promise<AppConnection | null>;
  /** The connection's `encrypted_secrets`, or null for an unknown id. */
  findEncryptedSecrets(id: string): Promise<string | null>;
}

export function appConnectionRepository(db: Orm | Tx): AppConnectionRepository {
  const orm = () => ormOf(db);
  return {
    newId: async () => {
      // Postgres makes every id of this database, so connection ids sort like the others.
      const { rows } = await orm().execute<{ id: string }>(sql`select uuidv7() as id`);
      return rows[0]!.id;
    },
    insert: async (connection) => {
      const [stored] = await orm().insert(appConnections).values(connection).returning(columns);
      return stored!;
    },
    update: async (id, connection) => {
      const [stored] = await orm()
        .update(appConnections)
        .set(connection)
        .where(eq(appConnections.id, id))
        .returning(columns);
      return stored ?? null;
    },
    findByConnector: async (connector) => {
      const [connection] = await orm()
        .select(columns)
        .from(appConnections)
        .where(eq(appConnections.connector, connector));
      return connection ?? null;
    },
    findAll: () => orm().select(columns).from(appConnections),
    findById: async (id) => {
      const [connection] = await orm()
        .select(columns)
        .from(appConnections)
        .where(eq(appConnections.id, id));
      return connection ?? null;
    },
    findByApps: (appIds) =>
      orm().select(columns).from(appConnections).where(anyOf(appConnections.appId, appIds)),
    lockById: async (id) => {
      const [connection] = await orm()
        .select(columns)
        .from(appConnections)
        .where(eq(appConnections.id, id))
        .for("update");
      return connection ?? null;
    },
    findEncryptedSecrets: async (id) => {
      const [row] = await orm()
        .select({ encryptedSecrets: appConnections.encryptedSecrets })
        .from(appConnections)
        .where(eq(appConnections.id, id));
      return row?.encryptedSecrets ?? null;
    },
  };
}

const columns = {
  id: appConnections.id,
  connector: appConnections.connector,
  appId: appConnections.appId,
  settings: appConnections.settings,
  connectedAt: appConnections.connectedAt,
  status: appConnections.status,
};
