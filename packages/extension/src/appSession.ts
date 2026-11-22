import type { AppSession } from "@broccoli-access/connector-contract";

/** The permissions the hand-over asks Chrome for, with host access to the app's domains. */
export const APP_SESSION_PERMISSIONS: chrome.runtime.ManifestPermission[] = [
  "cookies",
  "scripting",
];

/**
 * Chrome's host match patterns for the domains and their subdomains, over HTTP and HTTPS: one
 * pattern per scheme, as the manifest's optional host permissions name them, or Chrome refuses
 * to ask for a `*://` pattern.
 */
export function hostPatternsOf(domains: readonly string[]): string[] {
  return domains.flatMap((domain) => [`http://*.${domain}/*`, `https://*.${domain}/*`]);
}

/** The cookies of the named domains and their subdomains, in the connector contract's shape. */
export function appSessionCookiesOf(
  cookies: readonly chrome.cookies.Cookie[],
  domains: readonly string[],
): AppSession["cookies"] {
  return cookies
    .filter(({ domain }) => isWithinDomains(domain, domains))
    .map(({ name, value, domain, path, expirationDate, httpOnly, secure, sameSite }) => ({
      name,
      value,
      domain,
      path,
      ...(expirationDate === undefined ? {} : { expires: expirationDate }),
      httpOnly,
      secure,
      sameSite: SAME_SITE[sameSite],
    }));
}

/**
 * Only the named keys' values, as the app's page keeps them in local storage; null when one is
 * missing, which means the page is not signed in.
 */
export function appSessionStorageOf(
  values: Record<string, unknown>,
  storageKeys: readonly string[],
): AppSession["storage"] | null {
  const storage: AppSession["storage"] = {};
  for (const key of storageKeys) {
    const value = values[key];
    if (typeof value !== "string") {
      return null;
    }
    storage[key] = value;
  }
  return storage;
}

/** Chrome's `unspecified` is a cookie set without SameSite, which Chrome treats as `Lax`. */
const SAME_SITE: Record<chrome.cookies.SameSiteStatus, AppSession["cookies"][number]["sameSite"]> =
  {
    no_restriction: "None",
    lax: "Lax",
    strict: "Strict",
    unspecified: "Lax",
  };

/** Whether a cookie set for `cookieDomain`, such as `.slack.com`, belongs to one of `domains`. */
function isWithinDomains(cookieDomain: string, domains: readonly string[]): boolean {
  const host = cookieDomain.replace(/^\./, "").toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
