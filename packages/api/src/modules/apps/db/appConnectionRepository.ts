import { eq, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { appConnections } from "./appConnectionsTable";

/** A connection as stored, without its secrets. */
export interface AppConnection {
  id: string;
  connector: string;
  appId: string;
  settings: Record<string, unknown>;
  connectedAt: Date;
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
  /** Replaces the connection's settings and secrets; null for an unknown id. */
  update(
    id: string,
    connection: { settings: Record<string, unknown>; encryptedSecrets: string },
  ): Promise<AppConnection | null>;
  findByConnector(connector: string): Promise<AppConnection | null>;
  findById(id: string): Promise<AppConnection | null>;
  /** The connection of the app `appId`, or null for an app nobody connected. */
  findByApp(appId: string): Promise<AppConnection | null>;
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
    findById: async (id) => {
      const [connection] = await orm()
        .select(columns)
        .from(appConnections)
        .where(eq(appConnections.id, id));
      return connection ?? null;
    },
    findByApp: async (appId) => {
      const [connection] = await orm()
        .select(columns)
        .from(appConnections)
        .where(eq(appConnections.appId, appId));
      return connection ?? null;
    },
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
};
