import { z } from "zod";

/** Where a connector's calls can run (contract "Runtimes"). */
export const RUNTIME_KINDS = ["server", "owner_browser"] as const;

/** What a connector can do with its app's accounts in v1. */
export const CAPABILITIES = [
  "list_accounts",
  "suspend",
  "reactivate",
  "invite",
  "list_invitations",
] as const;

/** A value the owner types or pastes, such as an API key. */
const TEXT_FIELD = z.object({
  key: z.string().min(1),
  kind: z.literal("text"),
  label: z.string().min(1),
  help: z.string(),
  secret: z.boolean(),
});

/** The owner's session in the app, which the extension collects; always secret. */
const APP_SESSION_FIELD = z.object({
  key: z.string().min(1),
  kind: z.literal("app_session"),
  label: z.string().min(1),
  help: z.string(),
  domains: z.array(z.string().min(1)).min(1),
  storageKeys: z.array(z.string().min(1)).optional(),
});

/** One connector the container offers: what the core shows and runs without code for its app. */
export const CONNECTOR_DESCRIPTION = z.object({
  key: z.string().min(1),
  version: z.int().positive(),
  name: z.string().min(1),
  appDomain: z.string().min(1),
  /** In the order the core tries them. */
  runtimes: z.array(z.enum(RUNTIME_KINDS)).min(1),
  /** A capability a later v1 adds is left out, so an older reader still reads the manifest. */
  capabilities: z
    .array(z.string())
    .min(1)
    .transform((capabilities) => capabilities.filter(isCapability)),
  findingKind: z.string().min(1),
  connectionFields: z.array(z.discriminatedUnion("kind", [TEXT_FIELD, APP_SESSION_FIELD])),
  /** Shown before the first connection; null for an API connector. */
  notice: z.string().min(1).nullable(),
  /** Its `{placeholders}` name fields of the connection's settings. */
  adminUrl: z.string().min(1),
});

/** The answer of `GET /v1/connectors`. */
export const CONNECTOR_MANIFEST = z.object({ connectors: z.array(CONNECTOR_DESCRIPTION) });

function isCapability(capability: string): capability is Capability {
  return (CAPABILITIES as readonly string[]).includes(capability);
}

export type RuntimeKind = (typeof RUNTIME_KINDS)[number];
export type Capability = (typeof CAPABILITIES)[number];
export type ConnectorDescription = z.infer<typeof CONNECTOR_DESCRIPTION>;
export type ConnectionField = ConnectorDescription["connectionFields"][number];
export type ConnectorManifest = z.infer<typeof CONNECTOR_MANIFEST>;
