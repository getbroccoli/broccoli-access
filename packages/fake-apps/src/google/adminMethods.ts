import directoryDiscovery from "./discovery/directoryV1.json" with { type: "json" };
import reportsDiscovery from "./discovery/reportsV1.json" with { type: "json" };

/** The Admin API methods the fake serves, by their id in Google's discovery documents. */
export const ADMIN_METHODS = [
  "directory.customers.get",
  "directory.users.list",
  "directory.tokens.list",
  "reports.activities.list",
] as const;

export type AdminMethod = (typeof ADMIN_METHODS)[number];

/** What Google's discovery document says a method accepts: any of its scopes, and its page sizes. */
export interface AdminMethodRules {
  scopes: string[];
  maxResults?: { minimum: number; maximum: number; default: number };
}

/** The rules of `method`, read from the committed copies of Google's discovery documents. */
export function adminMethodRules(method: AdminMethod): AdminMethodRules {
  return METHOD_RULES[method];
}

interface DiscoveryMethod {
  scopes: string[];
  parameters: Record<string, DiscoveryParameter>;
}

interface DiscoveryParameter {
  type: string;
  minimum?: string;
  maximum?: string;
  default?: string;
}

const directory = directoryDiscovery.resources;

const METHOD_RULES: Record<AdminMethod, AdminMethodRules> = {
  "directory.customers.get": rulesOf(directory.customers.methods.get),
  "directory.users.list": rulesOf(directory.users.methods.list),
  "directory.tokens.list": rulesOf(directory.tokens.methods.list),
  "reports.activities.list": rulesOf(reportsDiscovery.resources.activities.methods.list),
};

function rulesOf({ scopes, parameters }: DiscoveryMethod): AdminMethodRules {
  const bounds = parameters.maxResults;
  if (bounds === undefined) return { scopes };
  return {
    scopes,
    maxResults: {
      minimum: Number(bounds.minimum ?? 1),
      maximum: Number(bounds.maximum),
      default: Number(bounds.default ?? bounds.maximum),
    },
  };
}
