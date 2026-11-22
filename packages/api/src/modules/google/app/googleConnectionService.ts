import { ApplicationError, type FieldError, invalidInput } from "../../../core/applicationError";
import type { Orm, Transact } from "../../../core/db";
import { createInstanceService, createOwnerService } from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import type { SecretBox } from "../../../core/secrets";
import {
  type EmployeeDirectory,
  PrincipalSecurityContext,
  profilesOf,
  type SecurityContext,
} from "../../../core/security";
import { createGoogleClient } from "../../../integrations/google";
import {
  GOOGLE_WORKSPACE,
  GOOGLE_WORKSPACE_SCOPES,
  googleRedirectAddress,
  type GoogleWorkspaceSettings,
  parseGoogleWorkspaceSettings,
} from "../domain";
import {
  openConsentState,
  randomConsentToken,
  sealConsentState,
  type WorkspaceConsentState,
} from "../helpers";
import type { ConnectedApps, Scans } from "../ports";
import { consentUrl } from "./consentUrl";
import { readSuperAdmin, type SuperAdmin, type VerifiedGrant, verifyGrant } from "./verifyGrant";

const instances = createInstanceService();
const owners = createOwnerService();

/** Connecting Google Workspace with the instance's own Google app, as setup's first step. */
export interface GoogleConnectionService {
  /**
   * For the browser holding setup at the connect step: the Google consent address to send the
   * admin to, its `state` carrying the client credentials encrypted. Refuses blank credentials
   * with INVALID_INPUT, another caller with FORBIDDEN and another step with CONFLICT.
   */
  startConnection: (
    ctx: SecurityContext,
    start: ConnectionStart,
  ) => Promise<{ authorizationUrl: string }>;
  /**
   * Google's answer to the consent: verifies it and, for a super admin, saves the connection, makes
   * the admin the owner with their Google account, moves setup to the scan and queues the first
   * scan, in one transaction.
   * Refuses a consent by anyone else with `NotSuperAdminError`, and an answer it cannot trust with
   * INVALID_INPUT, FORBIDDEN or CONFLICT; nothing is written then.
   */
  finishConsent: (ctx: SecurityContext, answer: ConsentAnswer) => Promise<{ userId: string }>;
  /** The connection as Setup shows it, or null before it exists. Admins only. */
  readConnection: (ctx: SecurityContext) => Promise<GoogleWorkspaceConnection | null>;
  /** The connected organisation's name and primary domain, which the sign-in page shows; null before it. Public. */
  readOrganization: () => Promise<{ name: string; domain: string } | null>;
}

/** What the browser holding setup sends to start the consent. */
export interface ConnectionStart {
  clientId: string;
  clientSecret: string;
  /** Where browsers reach the instance; Google redirects to its callback there. */
  publicOrigin: string;
  setupToken: string | null;
  now: Date;
}

/** Google's redirect back after the admin allowed access. */
export interface ConsentAnswer {
  code: string;
  state: string;
  publicOrigin: string;
  setupToken: string | null;
  now: Date;
}

export interface GoogleWorkspaceConnection {
  id: string;
  domain: string;
  organizationName: string;
  adminEmail: string;
}

export interface GoogleConnectionDependencies {
  orm: Orm;
  transact: Transact;
  secretBox: SecretBox;
  logger: Logger;
  /** `GOOGLE_OPENID_CONFIGURATION_URL`. */
  openIdConfigurationUrl: string;
  /** `GOOGLE_ADMIN_API_URL`. */
  adminApiUrl: string;
  connectedApps: ConnectedApps;
  scans: Scans;
  /** Builds the new owner's security context, which authors the connection's history. */
  employeeDirectory: EmployeeDirectory;
}

export function createGoogleConnectionService(
  dependencies: GoogleConnectionDependencies,
): GoogleConnectionService {
  const { orm, secretBox, connectedApps } = dependencies;
  const google = createGoogleClient(dependencies);
  return {
    async startConnection(ctx, { clientId, clientSecret, publicOrigin, setupToken, now }) {
      ctx.requireSetupHolder();
      const credentials = parseCredentials(clientId, clientSecret);
      const heldToken = await requireConnectStep(orm, setupToken, now);
      const nonce = randomConsentToken();
      const state = sealConsentState(
        secretBox,
        { flow: "connect_google_workspace", ...credentials, nonce },
        { browserToken: heldToken, now },
      );
      const { authorizationEndpoint } = await google.discover();
      return {
        authorizationUrl: consentUrl(
          authorizationEndpoint,
          {
            clientId: credentials.clientId,
            redirectUri: googleRedirectAddress(publicOrigin),
            scopes: GOOGLE_WORKSPACE_SCOPES,
            state,
            nonce,
          },
          OFFLINE_CONSENT,
        ),
      };
    },
    async finishConsent(ctx, answer) {
      ctx.requireSetupHolder();
      const setupToken = await requireConnectStep(orm, answer.setupToken, answer.now);
      const consent = openConsentState(secretBox, answer.state, {
        browserToken: setupToken,
        now: answer.now,
      });
      if (consent?.flow !== "connect_google_workspace") {
        throw new ApplicationError(
          "INVALID_INPUT",
          "The consent expired or was not this server's.",
        );
      }
      const redirectUri = googleRedirectAddress(answer.publicOrigin);
      const grant = await verifyGrant(google, consent, { ...answer, redirectUri });
      const admin = await readSuperAdmin(google, grant.tokens.accessToken, grant.identity);
      return saveConnection(dependencies, ctx, answer, { consent, grant, admin });
    },
    async readConnection(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      const connection = await connectedApps.readConnection(orm, GOOGLE_WORKSPACE);
      if (!connection) {
        return null;
      }
      const { domain, organizationName, adminEmail } = parseGoogleWorkspaceSettings(
        connection.settings,
      );
      return { id: connection.id, domain, organizationName, adminEmail };
    },
    async readOrganization() {
      const connection = await connectedApps.readConnection(orm, GOOGLE_WORKSPACE);
      if (!connection) {
        return null;
      }
      const { organizationName, domain } = parseGoogleWorkspaceSettings(connection.settings);
      return { name: organizationName, domain };
    },
  };
}

/** Google gives a refresh token, which the scans need, only for an offline consent asked now. */
const OFFLINE_CONSENT = { access_type: "offline", prompt: "consent" };

function parseCredentials(clientId: string, clientSecret: string) {
  const credentials = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  const fieldErrors: FieldError[] = Object.entries(credentials)
    .filter(([, value]) => value === "")
    .map(([field]) => ({ field, code: "required" }));
  if (fieldErrors.length > 0) {
    throw invalidInput(fieldErrors);
  }
  return credentials;
}

/** The setup token, once its browser is found to hold setup at the connect step; refuses otherwise. */
async function requireConnectStep(orm: Orm, setupToken: string | null, now: Date): Promise<string> {
  const instance = await instances.readInstance(orm);
  if (setupToken === null || !instance.isSetupHeldBy(setupToken, now)) {
    throw new ApplicationError("FORBIDDEN", "Only the browser holding setup can connect Google.");
  }
  if (instance.step !== "connect_google") {
    throw new ApplicationError("CONFLICT", "Google Workspace is already connected.");
  }
  return setupToken;
}

/** Writes the connection, the owner, the next step and the first scan together, then logs the outcome. */
async function saveConnection(
  { transact, connectedApps, scans, employeeDirectory, logger }: GoogleConnectionDependencies,
  ctx: SecurityContext,
  { setupToken, now }: ConsentAnswer,
  {
    consent,
    grant,
    admin,
  }: { consent: WorkspaceConsentState; grant: VerifiedGrant; admin: SuperAdmin },
): Promise<{ userId: string }> {
  const settings: GoogleWorkspaceSettings = {
    googleApp: "own_google_app",
    clientId: consent.clientId,
    domain: admin.domain,
    organizationName: admin.organizationName,
    adminEmail: admin.email,
    grantedScopes: grant.tokens.scopes,
  };
  const saved = await transact(async (tx) => {
    const { userId } = await owners.createOwnerAtConnect(
      ctx,
      tx,
      { setupToken, now },
      { googleUserId: grant.identity.sub, email: admin.email, name: admin.fullName },
    );
    const owner = ownerContext(userId, admin.email, employeeDirectory);
    const { connectionId } = await connectedApps.connectApp(owner, tx, {
      catalogKey: GOOGLE_WORKSPACE,
      connector: GOOGLE_WORKSPACE,
      settings: { ...settings },
      secrets: { clientSecret: consent.clientSecret, refreshToken: grant.tokens.refreshToken },
    });
    const { sourceId } = await scans.scanConnection(owner, tx, connectionId);
    return { userId, connectionId, sourceId };
  });
  logger.info(saved, "Google Workspace connected; its admin is the owner and its scan is queued");
  return { userId: saved.userId };
}

/** The new owner, who authors the connection's history in the transaction that creates them. */
function ownerContext(
  userId: string,
  email: string,
  directory: EmployeeDirectory,
): SecurityContext {
  const user = {
    userId,
    email,
    isOwner: true,
    permissionProfiles: profilesOf(true),
    employeeId: null,
  };
  return PrincipalSecurityContext.user(user, directory);
}
