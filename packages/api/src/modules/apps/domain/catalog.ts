/** An app Broccoli Access knows by name, with how sources name it. */
export interface CatalogApp {
  key: string;
  name: string;
  domain: string;
  /** How sources name the app, prefixed by source, such as `google:<client id>`. */
  externalIds: string[];
}

/** The catalog app with `key`; throws for a key the catalog lacks, which only code passes. */
export function catalogApp(key: string): CatalogApp {
  const app = CATALOG.find((candidate) => candidate.key === key);
  if (!app) {
    throw new Error(`The catalog has no app ${key}`);
  }
  return app;
}

/** The catalog app a source names by `externalId`, else by `name` ignoring case; undefined for none. */
export function findCatalogApp({
  externalId,
  name,
}: {
  externalId: string;
  name: string;
}): CatalogApp | undefined {
  const lowerName = name.toLowerCase();
  return (
    CATALOG.find((app) => app.externalIds.includes(externalId)) ??
    CATALOG.find((app) => app.name.toLowerCase() === lowerName)
  );
}

// Known external ids: none yet; real Google's client ids join once a real directory shows them.
/** The built-in catalog: the setup's own app and the apps companies sign in to most. */
const CATALOG: readonly CatalogApp[] = [
  {
    key: "google_workspace",
    name: "Google Workspace",
    domain: "workspace.google.com",
    externalIds: [],
  },
  { key: "slack", name: "Slack", domain: "slack.com", externalIds: [] },
  { key: "notion", name: "Notion", domain: "notion.so", externalIds: [] },
  { key: "figma", name: "Figma", domain: "figma.com", externalIds: [] },
  { key: "miro", name: "Miro", domain: "miro.com", externalIds: [] },
  { key: "loom", name: "Loom", domain: "loom.com", externalIds: [] },
  { key: "claude", name: "Claude", domain: "claude.ai", externalIds: [] },
  { key: "chatgpt", name: "ChatGPT", domain: "chatgpt.com", externalIds: [] },
  { key: "canva", name: "Canva", domain: "canva.com", externalIds: [] },
  { key: "calendly", name: "Calendly", domain: "calendly.com", externalIds: [] },
  { key: "zoom", name: "Zoom", domain: "zoom.us", externalIds: [] },
  { key: "typeform", name: "Typeform", domain: "typeform.com", externalIds: [] },
  { key: "grammarly", name: "Grammarly", domain: "grammarly.com", externalIds: [] },
];
