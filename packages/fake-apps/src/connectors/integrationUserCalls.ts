import {
  CONNECTION_SIGN_IN_REQUEST,
  INTEGRATION_USER_SETUP_REQUEST,
  type ConnectionSignInAnswer,
  type ConnectionSignInRequest,
  type ConnectorErrorAnswer,
  type IntegrationUser,
  type IntegrationUserSetupAnswer,
} from "@broccoli-access/connector-contract";
import { Router } from "express";
import { z } from "zod";

import { ADMIN_ROLE, INTEGRATION_USER_TOTP_SECRET, type SeedMember } from "../seed";
import { answerCall, errorAnswer, type CallPlan } from "./answerCall";
import type { ConnectorsState, FakeConnectorsContext } from "./connectorsState";
import { detailsOf, reachesOtherWorkspace, type FakeConnector } from "./fakeConnector";
import { findConnector } from "./fakeConnectorList";
import { acceptInvitation } from "./invitations";

/**
 * The two calls that sign in as the integration user, answered from memory with no browser
 * (docs/fake-apps.md, "Fake connectors container: what is added").
 */
export function integrationUserCallRoutes(context: FakeConnectorsContext): Router {
  return Router()
    .post(
      "/v1/integration-user/setup",
      answerCall(
        context,
        "integration-user/setup",
        INTEGRATION_USER_SETUP_REQUEST,
        ({ integrationUser }) => ({
          answer: (state) => setUp(context.googleUrl, state, integrationUser),
        }),
      ),
    )
    .post(
      "/v1/connections/sign-in",
      answerCall(context, "connections/sign-in", CONNECTION_SIGN_IN_REQUEST, signInPlan),
    );
}

/** The part of the fake Google's `GET /_fake/state` that lists the users created since its reset. */
const GOOGLE_STATE = z.object({
  createdUsers: z.array(z.object({ primaryEmail: z.string() })),
});

type SetupAnswer = IntegrationUserSetupAnswer | ConnectorErrorAnswer;

/**
 * Answers the fixed secret for a user the fake Google created. That fake never tells a password,
 * so the first one a user is set up with counts as theirs from then on.
 */
async function setUp(
  googleUrl: string | undefined,
  state: ConnectorsState,
  { email, password, totpSecret }: IntegrationUser,
): Promise<SetupAnswer> {
  if (totpSecret !== null && totpSecret !== INTEGRATION_USER_TOTP_SECRET) {
    return errorAnswer("authentication_failed");
  }
  if (googleUrl === undefined) return errorAnswer("authentication_failed");
  const created = await createdEmails(googleUrl);
  if (created === undefined) return errorAnswer("app_unavailable");
  const known = state.integrationUserPasswords.get(email) ?? password;
  if (!created.includes(email) || known !== password) return errorAnswer("authentication_failed");
  state.integrationUserPasswords.set(email, password);
  return { totpSecret: INTEGRATION_USER_TOTP_SECRET };
}

/** The emails of the users the fake Google created; nothing when it does not answer with them. */
async function createdEmails(googleUrl: string): Promise<string[] | undefined> {
  try {
    const response = await fetch(new URL("/_fake/state", googleUrl));
    const { createdUsers } = GOOGLE_STATE.parse(await response.json());
    return createdUsers.map((user) => user.primaryEmail.toLowerCase());
  } catch {
    return undefined;
  }
}

function signInPlan(request: ConnectionSignInRequest): CallPlan {
  const connector = findConnector(request.connector);
  if (connector === undefined) return { refused: "No connector has this key" };
  if (connector.startSession === undefined) {
    return { refused: "The connector does not list sign_in" };
  }
  return {
    connector: connector.description.key,
    answer: (state) => signIn(connector, state, request),
  };
}

/**
 * Signs in with the two-step secret, joins the workspace the integration user is invited to, and
 * answers a session of its own only to an admin.
 */
function signIn(
  connector: FakeConnector,
  state: ConnectorsState,
  { integrationUser, connection }: ConnectionSignInRequest,
): ConnectionSignInAnswer | ConnectorErrorAnswer {
  if (!passesDirectorySignIn(state, integrationUser)) return errorAnswer("authentication_failed");
  if (connection !== null && reachesOtherWorkspace(connector, connection.settings)) {
    return errorAnswer("wrong_workspace");
  }
  const member = joinedMember(connector, state, integrationUser.email);
  if (member === undefined) return errorAnswer("not_invited");
  if (member.role !== ADMIN_ROLE) return errorAnswer("permission_missing");
  return {
    details: detailsOf(connector),
    connection: {
      settings: connector.workspace.settings,
      secrets: connector.startSession!(state, member),
    },
  };
}

/** A fake that never set the user up knows no password of theirs, and checks the secret only. */
function passesDirectorySignIn(
  state: ConnectorsState,
  { email, password, totpSecret }: IntegrationUser,
): boolean {
  const known = state.integrationUserPasswords.get(email) ?? password;
  return totpSecret === INTEGRATION_USER_TOTP_SECRET && known === password;
}

/** The email's member, after accepting its pending invitation when it has one. */
function joinedMember(
  connector: FakeConnector,
  state: ConnectorsState,
  email: string,
): SeedMember | undefined {
  const member = state.members[connector.description.key].find((each) => each.email === email);
  return member ?? acceptInvitation(connector, state, email);
}
