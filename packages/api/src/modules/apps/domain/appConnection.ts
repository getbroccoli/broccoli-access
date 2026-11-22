import type { KnownApp, NewApp } from "./app";
import { CATALOG_KEYS, catalogApp } from "./catalog";

/** Whether a connection works: `reconnect` once its key or session stopped working. */
export const APP_CONNECTION_STATUSES = ["connected", "reconnect"] as const;

/** The connector errors that turn a connection to `reconnect`. */
export const RECONNECT_CAUSES = [
  "authentication_failed",
  "permission_missing",
  "wrong_workspace",
] as const;

/** The app a new connection reads: a known app, or one to create. */
export type ConnectedApp<T extends KnownApp> = { known: T } | { created: NewApp };

/**
 * The app a connector's new connection reads, as the data model orders it: the app whose catalog
 * key is the connector's key, else the app with the connector's name ignoring case, else the
 * catalog app with that key, else a new app named after the connector.
 */
export function connectedAppOf<T extends KnownApp>(
  known: readonly T[],
  connector: { key: string; name: string; domain: string | null },
): ConnectedApp<T> {
  const lowerName = connector.name.toLowerCase();
  const app =
    known.find(({ catalogKey }) => catalogKey === connector.key) ??
    known.find(({ name }) => name.toLowerCase() === lowerName);
  if (app) {
    return { known: app };
  }
  if (CATALOG_KEYS.has(connector.key)) {
    const { key, name, domain, externalIds } = catalogApp(connector.key);
    return { created: { name, domain, catalogKey: key, externalIds } };
  }
  return {
    created: { name: connector.name, domain: connector.domain, catalogKey: null, externalIds: [] },
  };
}
