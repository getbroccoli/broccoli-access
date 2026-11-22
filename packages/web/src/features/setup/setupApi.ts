import { postJson } from "@/lib/postJson";

/**
 * Starts setup in this browser, or renews it for the browser holding it; the API sets
 * the setup cookie. Returns whether this browser holds setup.
 */
export async function startSetup(): Promise<boolean> {
  try {
    // A browser without a token first only gets one, so an answer it never receives claims nothing.
    const holder = await postSetupStart();
    return (holder === "nobody" ? await postSetupStart() : holder) === "you";
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

/** Who holds setup after one start: this browser, or nobody yet; null when the API refused. */
async function postSetupStart(): Promise<"you" | "nobody" | null> {
  const response = await postJson("/api/auth/setup/start", {});
  if (!response.ok) {
    return null;
  }
  const { holder } = (await response.json()) as { holder: "you" | "nobody" };
  return holder;
}
