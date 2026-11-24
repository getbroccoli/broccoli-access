import { randomBytes } from "node:crypto";

import { APP_SESSION, type AppSession } from "@broccoli-access/connector-contract";
import { Router } from "express";
import { z } from "zod";

import { ACME_SLACK, ADMIN_ROLE, type SeedMember } from "../seed";
import type { ConnectorsState, FakeConnectorsContext } from "./connectorsState";
import type { FakeConnector } from "./fakeConnector";

/** Where Slack's page keeps its token, which the manifest names for the extension. */
const STORAGE_KEY = "localConfig_v2";

/** The sign-in page's own host: the extension hands over only these cookies, never the app's. */
const SESSION_DOMAIN = "slack.localhost";

/**
 * Slack through the web methods its own pages call, with an app session: the `d` cookie and the
 * token Slack's page keeps in local storage. Only app sessions the fake issued count, each for
 * the member who signed in.
 */
export const SLACK: FakeConnector = {
  description: {
    key: "slack",
    version: 1,
    name: "Slack",
    appDomain: "slack.com",
    runtimes: ["server"],
    capabilities: [
      "list_accounts",
      "suspend",
      "reactivate",
      "invite",
      "list_invitations",
      "remove",
      "sign_in",
    ],
    roles: [
      { key: "member", name: "Member", isDefault: true },
      { key: ADMIN_ROLE, name: "Admin", isDefault: false },
    ],
    findingKind: "slack_members",
    connectionFields: [
      {
        key: "appSession",
        kind: "app_session",
        label: "Slack admin session",
        help: "Sign in to Slack in Chrome as a Workspace Admin, then connect.",
        domains: [SESSION_DOMAIN],
        storageKeys: [STORAGE_KEY],
      },
    ],
    notice:
      "Slack's terms may not allow automated access to its pages. broccoli-access acts only when you ask, in your own name, and stops at any check Slack shows.",
    adminUrl: "https://{teamDomain}.slack.com/admin",
  },
  workspace: ACME_SLACK,
  workspaceIdSetting: "teamId",
  workspaceDomain: `${ACME_SLACK.settings.teamDomain}.slack.com`,
  connectionMember: (state, secrets) => {
    const session = sessionOf(secrets);
    const issued = session && state.slackSessions.get(session.d);
    if (issued?.token !== session?.token) return undefined;
    return state.members.slack.find((member) => member.sourceKey === issued?.memberKey);
  },
  raw: (member) => ({
    id: member.sourceKey,
    team_id: ACME_SLACK.settings.teamId,
    name: member.email.split("@")[0],
    real_name: member.displayName,
    deleted: member.status === "suspended",
    is_admin: member.role === ADMIN_ROLE,
    is_owner: member.isConnectionUser,
    is_primary_owner: member.isConnectionUser,
    profile: { email: member.email, real_name: member.displayName },
  }),
  invitationDates: () => ({ invitedAt: null, expiresAt: null }),
  startSession: (state, member) => ({ appSession: appSessionOf(startSession(state, member)) }),
};

/**
 * `GET /slack/signin`: signs in as the workspace's owner at once, setting cookie `d` on the
 * page's host and keeping the token in local storage, as Slack's signed-in page does.
 */
export function slackSignInRoutes(context: FakeConnectorsContext): Router {
  return Router().get("/slack/signin", (_request, response) => {
    const { d, token } = startSession(context.state, OWNER);
    response.cookie("d", d, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS,
    });
    response.type("html").send(signInPage(token));
  });
}

/** Mia Novak, the primary owner, whom the sign-in page signs in. */
const OWNER = ACME_SLACK.members.find((member) => member.isConnectionUser)!;

/** Random enough that no caller guesses another's session. */
const SECRET_BYTES = 24;

/** About as long as Slack keeps its `d` cookie; the fake ends sessions only by its control. */
const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const SESSION_SECRET = z.object({ appSession: APP_SESSION });

/** Slack's local configuration: each signed-in team with the token its pages use. */
const LOCAL_CONFIG = z.object({
  teams: z.record(z.string(), z.object({ token: z.string() })),
});

interface SessionSecrets {
  d: string;
  token: string;
}

/** A session of `member` that the fake accepts until the session expiry control. */
function startSession(state: ConnectorsState, member: SeedMember): SessionSecrets {
  const d = `xoxd-${randomBytes(SECRET_BYTES).toString("base64url")}`;
  const token = `xoxc-${randomBytes(SECRET_BYTES).toString("hex")}`;
  state.slackSessions.set(d, { token, memberKey: member.sourceKey });
  return { d, token };
}

/** The session as the extension hands it over from the sign-in page. */
function appSessionOf({ d, token }: SessionSecrets): AppSession {
  const cookie = { name: "d", value: d, domain: SESSION_DOMAIN, path: "/" };
  return {
    cookies: [{ ...cookie, httpOnly: true, secure: false, sameSite: "Lax" }],
    storage: { [STORAGE_KEY]: JSON.stringify(localConfigOf(token)) },
  };
}

function sessionOf(secrets: Record<string, unknown>): SessionSecrets | undefined {
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

/** Slack's local configuration with Acme as its one signed-in team. */
function localConfigOf(token: string) {
  const { teamId, teamDomain, teamName } = ACME_SLACK.settings;
  return { teams: { [teamId!]: { id: teamId, name: teamName, domain: teamDomain, token } } };
}

function signInPage(token: string): string {
  const { teamName } = ACME_SLACK.settings;
  // The seed's values and a hex token hold no `</script>`, so the JSON needs no escaping.
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Slack (fake): ${teamName}</title></head>
  <body>
    <h1>Sign in as ${OWNER.displayName}</h1>
    <p>Signed in to ${teamName}'s Slack. The session is in cookie <code>d</code> and local storage.</p>
    <script type="application/json" id="${STORAGE_KEY}">${JSON.stringify(localConfigOf(token))}</script>
    <script>
      localStorage.setItem("${STORAGE_KEY}", document.getElementById("${STORAGE_KEY}").textContent);
    </script>
  </body>
</html>
`;
}
