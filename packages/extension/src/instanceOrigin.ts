/**
 * Whether the extension may pair with `origin`: HTTPS, or plain HTTP on this computer only, since
 * the pairing's token, and later app sessions, travel to it.
 */
export function isPairableOrigin(origin: string): boolean {
  const url = new URL(origin);
  return (
    url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))
  );
}

/**
 * The instance origin the pair page was opened for, from its `origin` parameter; null unless it
 * is a bare origin the extension may pair with, so the page never pairs with a path or plain HTTP.
 */
export function parseInstanceOrigin(raw: string | null): string | null {
  if (raw === null || !URL.canParse(raw)) {
    return null;
  }
  return new URL(raw).origin === raw && isPairableOrigin(raw) ? raw : null;
}

/** The origin as the owner reads it: the host for HTTPS, the whole origin otherwise, so plain HTTP shows. */
export function shownOrigin(origin: string): string {
  const url = new URL(origin);
  return url.protocol === "https:" ? url.host : url.origin;
}

/** The host permission for exactly the instance's origin, which Chrome asks the owner for at Pair. */
export function hostPermissionOf(origin: string): { origins: string[] } {
  return { origins: [`${origin}/*`] };
}

/** Hosts that never leave this computer, where plain HTTP is safe for development. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
