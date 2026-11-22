import { postJson } from "@/lib/postJson";

/**
 * Starts the owner's consent for a new Google app: the address of Google's consent page, or null
 * when the API refused or could not be reached. The API binds the consent to this browser.
 */
export async function startGoogleAppChange(
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  try {
    const response = await postJson("/api/google/change-app", { clientId, clientSecret });
    if (!response.ok) {
      return null;
    }
    const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };
    return authorizationUrl;
  } catch {
    return null;
  }
}
