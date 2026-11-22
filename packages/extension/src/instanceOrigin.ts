/**
 * The instance origin the pair page was opened for, from its `origin` parameter; null unless it
 * is a bare HTTP or HTTPS origin, so the page never pairs with a path or another scheme.
 */
export function parseInstanceOrigin(raw: string | null): string | null {
  if (raw === null || !URL.canParse(raw)) {
    return null;
  }
  const url = new URL(raw);
  const isWebOrigin = url.protocol === "https:" || url.protocol === "http:";
  return isWebOrigin && url.origin === raw ? raw : null;
}

/** The origin as the owner reads it: the host for HTTPS, the whole origin otherwise, so plain HTTP shows. */
export function shownOrigin(origin: string): string {
  const url = new URL(origin);
  return url.protocol === "https:" ? url.host : url.origin;
}

/** The host permission for exactly the instance's origin, which Chrome asks the owner for at Pair. */
export function hostPermissionOf(origin: string): chrome.permissions.Permissions {
  return { origins: [`${origin}/*`] };
}
