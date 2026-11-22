import { APP_SESSION, type AppSession } from "@broccoli-access/connector-contract";

/** What an app session field lets the extension hand over, as the connector's manifest names it. */
export interface AppSessionScope {
  /** Cookies of these domains and their subdomains. */
  domains: readonly string[];
  /** Values the app's signed-in page keeps in local storage under these keys. */
  storageKeys: readonly string[];
}

/**
 * The handed-over session, when it is in the contract's shape and holds only what `scope` names;
 * null otherwise, so a session carrying anything else is refused whole rather than trimmed.
 */
export function parseAppSession(raw: unknown, scope: AppSessionScope): AppSession | null {
  const parsed = APP_SESSION.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const { cookies, storage } = parsed.data;
  const isWithinScope =
    cookies.every(({ domain }) => isWithinDomains(domain, scope.domains)) &&
    Object.keys(storage).every((key) => scope.storageKeys.includes(key));
  return isWithinScope ? parsed.data : null;
}

/** Whether a cookie set for `cookieDomain`, such as `.slack.com`, belongs to one of `domains`. */
function isWithinDomains(cookieDomain: string, domains: readonly string[]): boolean {
  const host = cookieDomain.replace(/^\./, "").toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
