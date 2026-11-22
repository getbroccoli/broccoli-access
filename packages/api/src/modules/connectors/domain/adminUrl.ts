/**
 * Where the owner manages the app's members: the connector's `adminUrl` with each `{name}` taking
 * the connection's string setting `name`, URL-encoded. Null when a placeholder names no string
 * setting, or the result is not a web address, so a link never runs a script.
 */
export function adminUrlOf(template: string, settings: Record<string, unknown>): string | null {
  let missing = false;
  const filled = template.replace(PLACEHOLDER, (_placeholder, name: string) => {
    const value = settings[name];
    if (typeof value !== "string") {
      missing = true;
      return "";
    }
    return encodeURIComponent(value);
  });
  return missing || !isWebAddress(filled) ? null : filled;
}

/** `{name}`, naming a field of the connection's settings. */
const PLACEHOLDER = /\{(\w+)\}/g;

function isWebAddress(address: string): boolean {
  return URL.canParse(address) && ["http:", "https:"].includes(new URL(address).protocol);
}
