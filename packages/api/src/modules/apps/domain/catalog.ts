/** An app Broccoli Access knows by name, with how sources name it. */
export interface CatalogApp {
  key: string;
  name: string;
  domain: string;
  /** How sources name the app, prefixed by source, such as `google:<client id>`. */
  externalIds: string[];
}

/** The built-in catalog; for now the one app the setup connects. */
const CATALOG: readonly CatalogApp[] = [
  {
    key: "google_workspace",
    name: "Google Workspace",
    domain: "workspace.google.com",
    externalIds: [],
  },
];

/** The catalog app with `key`; throws for a key the catalog lacks, which only code passes. */
export function catalogApp(key: string): CatalogApp {
  const app = CATALOG.find((candidate) => candidate.key === key);
  if (!app) {
    throw new Error(`The catalog has no app ${key}`);
  }
  return app;
}
