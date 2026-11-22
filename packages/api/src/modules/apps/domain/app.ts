import type { FieldChange } from "../../../core/records";
import { type CatalogApp, findCatalogApp } from "./catalog";

/** Whether the company uses an app: found by a scan, chosen by the owner, or set aside. */
export const APP_STATUSES = ["discovered", "approved", "ignored"] as const;

export type AppStatus = (typeof APP_STATUSES)[number];

/** An app as matching reads it. */
export interface KnownApp {
  id: string;
  name: string;
  catalogKey: string | null;
  externalIds: string[];
}

/** How a source names an app it found, such as `google:<client id>`, and the app's name there. */
export interface FoundApp {
  externalId: string;
  name: string;
}

/** What matching found apps changes: apps to create, and known apps that gain external ids. */
export interface AppMatchPlan<T extends KnownApp> {
  /** Apps to create as discovered, each with the external ids that go to it. */
  created: NewApp[];
  updated: { before: T; after: T }[];
}

export interface NewApp {
  name: string;
  /** Null when unknown. */
  domain: string | null;
  catalogKey: string | null;
  externalIds: string[];
}

/**
 * Matches each found app as the data model orders it: the known app holding its external id, the
 * catalog app listing that id, the catalog app with its name ignoring case, else a new app named
 * after it. Every match but the first adds the id to the app, creating a missing catalog app.
 */
export function planAppMatches<T extends KnownApp>(
  known: readonly T[],
  found: readonly FoundApp[],
): AppMatchPlan<T> {
  const afterById = new Map(
    known.map((app) => [app.id, { ...app, externalIds: [...app.externalIds] }]),
  );
  const created: NewApp[] = [];
  const heldIds = new Set(known.flatMap(({ externalIds }) => externalIds));
  for (const app of found) {
    if (heldIds.has(app.externalId)) {
      continue;
    }
    heldIds.add(app.externalId);
    const catalog = findCatalogApp(app);
    const target =
      catalog &&
      [...afterById.values(), ...created].find(({ catalogKey }) => catalogKey === catalog.key);
    if (target) {
      target.externalIds.push(app.externalId);
    } else {
      created.push(newApp(app, catalog));
    }
  }
  const updated = known
    .map((before) => ({ before, after: afterById.get(before.id)! }))
    .filter(({ before, after }) => after.externalIds.length > before.externalIds.length);
  return { created, updated };
}

/** The fields history keeps of an app, from `before` to `after`; null for none. */
export function appChanges(before: AppFields | null, after: AppFields | null): FieldChange[] {
  const fields = (app: AppFields | null) => ({
    name: app?.name ?? null,
    domain: app?.domain ?? null,
    catalogKey: app?.catalogKey ?? null,
    externalIds: app && app.externalIds.length > 0 ? app.externalIds.join(", ") : null,
    status: app?.status ?? null,
  });
  const old = fields(before);
  const current = fields(after);
  return APP_HISTORY_FIELDS.flatMap((field) =>
    old[field] === current[field]
      ? []
      : [{ field, oldValue: old[field], newValue: current[field] }],
  );
}

/** What history keeps of an app. */
export interface AppFields extends NewApp {
  status: AppStatus;
}

/** The fields whose changes history keeps, in the order a history line lists them. */
const APP_HISTORY_FIELDS = ["name", "domain", "catalogKey", "externalIds", "status"] as const;

function newApp({ externalId, name }: FoundApp, catalog: CatalogApp | undefined): NewApp {
  return catalog
    ? {
        name: catalog.name,
        domain: catalog.domain,
        catalogKey: catalog.key,
        externalIds: [externalId],
      }
    : { name, domain: null, catalogKey: null, externalIds: [externalId] };
}
