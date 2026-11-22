import { postJson } from "@/lib/postJson";

/**
 * Starts setup in this browser, or renews it for the browser holding it; the API sets
 * the setup cookie. Returns whether this browser holds setup.
 */
export async function startSetup(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/setup/start", {})).ok;
  } catch {
    return false;
  }
}

/**
 * Starts connecting Google Workspace with the admin's own Google app: the address of Google's
 * consent page, or null when the API refused or could not be reached.
 */
export async function startGoogleConnection(
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  try {
    const response = await postJson("/api/google/connect", { clientId, clientSecret });
    if (!response.ok) {
      return null;
    }
    const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };
    return authorizationUrl;
  } catch {
    return null;
  }
}
