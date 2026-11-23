import type { AppSession } from "@broccoli-access/connector-contract";
import type { RunningFakeConnectors } from "@broccoli-access/fake-apps";

/** Signs in as Mia and returns the session issued by the fake Slack connector. */
export async function signInToFakeSlack(fake: RunningFakeConnectors): Promise<AppSession> {
  const response = await fetch(new URL("/slack/signin", fake.url));
  const cookie = response.headers.getSetCookie().find((header) => header.startsWith("d="));
  const value = cookie?.match(/^d=([^;]+)/)?.[1];
  const html = await response.text();
  const localConfig = html.match(
    /<script\b(?=[^>]*\bid=["']localConfig_v2["'])[^>]*>([\s\S]*?)<\/script>/i,
  )?.[1];
  if (!value || !localConfig)
    throw new Error("Fake Slack sign-in did not return its cookie and localConfig_v2");
  return {
    cookies: [
      {
        name: "d",
        value,
        domain: "slack.localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    storage: { localConfig_v2: localConfig },
  };
}
