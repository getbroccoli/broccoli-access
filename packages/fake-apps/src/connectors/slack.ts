import { randomBytes } from "node:crypto";

import { APP_SESSION } from "@broccoli-access/connector-contract";
import { Router } from "express";
import { z } from "zod";

import { ACME_SLACK } from "../seed";
import type { FakeConnectorsContext } from "./connectorsState";
import type { FakeConnector } from "./fakeConnector";

/** Where Slack's page keeps its token, which the manifest names for the extension. */
const STORAGE_KEY = "localConfig_v2";

/**
 * Slack through the web methods its own pages call, with the owner's app session: the `d` cookie
 * and the token Slack's page keeps in local storage. Only app sessions the fake issued count.
 */
export const SLACK: FakeConnector = {
  key: "slack",
  description: {
    key: "slack",
    version: 1,
    name: "Slack",
    appDomain: "slack.com",
    runtimes: ["server"],
    capabilities: ["list_accounts", "suspend", "reactivate"],
    findingKind: "slack_members",
    connectionFields: [
      {
        key: "appSession",
        kind: "app_session",
        label: "Slack admin session",
        help: "Sign in to Slack in Chrome as a Workspace Admin, then connect.",
        // The sign-in page's own host: the extension hands over only these cookies, never the app's.
        domains: ["slack.localhost"],
        storageKeys: [STORAGE_KEY],
      },
    ],
    notice:
      "Slack's terms may not allow automated access to its pages. broccoli-access acts only when you ask, in your own name, and stops at any check Slack shows.",
    adminUrl: "https://{teamDomain}.slack.com/admin",
  },
  workspace: ACME_SLACK,
  workspaceIdSetting: "teamId",
  authenticates: (state, secrets) => {
    const session = sessionOf(secrets);
    return session !== undefined && state.slackSessions.get(session.d) === session.token;
  },
  raw: (member) => ({
    id: member.sourceKey,
    team_id: ACME_SLACK.settings.teamId,
    name: member.email.split("@")[0],
    real_name: member.displayName,
    deleted: member.status === "suspended",
    is_admin: member.isConnectionUser,
    is_owner: member.isConnectionUser,
    is_primary_owner: member.isConnectionUser,
    profile: { email: member.email, real_name: member.displayName },
  }),
};

/**
 * `GET /slack/signin`: signs in as the session's member at once, setting cookie `d` on the
 * page's host and keeping the token in local storage, as Slack's signed-in page does.
 */
export function slackSignInRoutes(context: FakeConnectorsContext): Router {
  return Router().get("/slack/signin", (_request, response) => {
    const d = `xoxd-${randomBytes(SECRET_BYTES).toString("base64url")}`;
    const token = `xoxc-${randomBytes(SECRET_BYTES).toString("hex")}`;
    context.state.slackSessions.set(d, token);
    response.cookie("d", d, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS,
    });
    response.type("html").send(signInPage(token));
  });
}

/** Random enough that no caller guesses another's session. */
const SECRET_BYTES = 24;

/** About as long as Slack keeps its `d` cookie; the fake ends sessions only by its control. */
const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const SESSION_SECRET = z.object({ appSession: APP_SESSION });

/** Slack's local configuration: each signed-in team with the token its pages use. */
const LOCAL_CONFIG = z.object({
  teams: z.record(z.string(), z.object({ token: z.string() })),
});

function sessionOf(secrets: Record<string, unknown>): { d: string; token: string } | undefined {
  const secret = SESSION_SECRET.safeParse(secrets);
  if (!secret.success) return undefined;
  const { cookies, storage } = secret.data.appSession;
  const d = cookies.find((cookie) => cookie.name === "d")?.value;
  const token = localConfig(storage[STORAGE_KEY])?.teams[ACME_SLACK.settings.teamId!]?.token;
  return d === undefined || token === undefined ? undefined : { d, token };
}

function localConfig(text: string | undefined): z.infer<typeof LOCAL_CONFIG> | undefined {
  try {
    return LOCAL_CONFIG.parse(JSON.parse(text ?? ""));
  } catch {
    return undefined;
  }
}

function signInPage(token: string): string {
  const { teamId, teamDomain, teamName } = ACME_SLACK.settings;
  const config = {
    teams: { [teamId!]: { id: teamId, name: teamName, domain: teamDomain, token } },
  };
  const owner = ACME_SLACK.members.find((member) => member.isConnectionUser);
  // The seed's values and a hex token hold no `</script>`, so the JSON needs no escaping.
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Slack (fake): ${teamName}</title></head>
  <body>
    <h1>Sign in as ${owner?.displayName}</h1>
    <p>Signed in to ${teamName}'s Slack. The session is in cookie <code>d</code> and local storage.</p>
    <script type="application/json" id="${STORAGE_KEY}">${JSON.stringify(config)}</script>
    <script>
      localStorage.setItem("${STORAGE_KEY}", document.getElementById("${STORAGE_KEY}").textContent);
    </script>
  </body>
</html>
`;
}
