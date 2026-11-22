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
import { createGoogleClient, type GoogleClient } from "../../../integrations/google";
import {
  GOOGLE_WORKSPACE,
  GOOGLE_WORKSPACE_SCOPES,
  googleRedirectAddress,
  type GoogleWorkspaceSettings,
  parseGoogleWorkspaceSettings,
  requireSameWorkspace,
  withGoogleApp,
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

/**
 * Connecting Google Workspace with the instance's own Google app, as setup's first step, and
 * changing that Google app later.
 */
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
  /**
   * For the owner: the Google consent address for a new Google app, its `state` carrying the new
   * client credentials encrypted for `browserToken`, a new token the caller keeps in this browser
   * until Google answers. Refuses blank credentials with INVALID_INPUT, another caller with
   * FORBIDDEN and CONFLICT before Google Workspace is connected.
   */
  startAppChange: (
    ctx: SecurityContext,
    start: AppChangeStart,
  ) => Promise<{ authorizationUrl: string; browserToken: string }>;
  /**
   * Google's answer to the new Google app's consent: verifies it like setup's and replaces the
   * connection's client, secrets, scopes and admin in one transaction; the owner, apps and people
   * stay. Refuses a consent from another workspace with `OtherWorkspaceError`, by anyone but a
   * super admin with `NotSuperAdminError`, and an answer it cannot trust with INVALID_INPUT,
   * FORBIDDEN or CONFLICT; nothing is written then.
   */
  finishAppChange: (ctx: SecurityContext, answer: AppChangeAnswer) => Promise<void>;
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

/** What the owner sends to change the Google app. */
export interface AppChangeStart {
  clientId: string;
  clientSecret: string;
  /** Where browsers reach the instance; Google redirects to its callback there. */
  publicOrigin: string;
  now: Date;
}

/** Google's redirect back after the admin allowed the new Google app. */
export interface AppChangeAnswer {
  code: string;
  state: string;
  publicOrigin: string;
  /** The token `startAppChange` gave the browser; null when the browser has none. */
  browserToken: string | null;
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
  const { orm, transact, secretBox, logger, connectedApps } = dependencies;
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
      return {
        authorizationUrl: await workspaceConsentUrl(google, {
          clientId: credentials.clientId,
          redirectUri: googleRedirectAddress(publicOrigin),
          state,
          nonce,
        }),
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
    async startAppChange(ctx, { clientId, clientSecret, publicOrigin, now }) {
      ctx.require("MANAGE_WORKSPACE");
      const credentials = parseCredentials(clientId, clientSecret);
      await requireConnection(connectedApps, orm);
      const nonce = randomConsentToken();
      const browserToken = randomConsentToken();
      const state = sealConsentState(
        secretBox,
        { flow: "change_google_app", ...credentials, nonce },
        { browserToken, now },
      );
      const authorizationUrl = await workspaceConsentUrl(google, {
        clientId: credentials.clientId,
        redirectUri: googleRedirectAddress(publicOrigin),
        state,
        nonce,
      });
      return { authorizationUrl, browserToken };
    },
    async finishAppChange(ctx, answer) {
      ctx.require("MANAGE_WORKSPACE");
      const { browserToken, now } = answer;
      const change =
        browserToken === null
          ? null
          : openConsentState(secretBox, answer.state, { browserToken, now });
      if (change?.flow !== "change_google_app") {
        throw new ApplicationError(
          "INVALID_INPUT",
          "The consent expired or was not this browser's.",
        );
      }
      const connection = await requireConnection(connectedApps, orm);
      const redirectUri = googleRedirectAddress(answer.publicOrigin);
      const grant = await verifyGrant(google, change, { ...answer, redirectUri });
      const admin = await readSuperAdmin(google, grant.tokens.accessToken, grant.identity);
      const settings = parseGoogleWorkspaceSettings(connection.settings);
      requireSameWorkspace(settings, admin.domain);
      const changed: GoogleWorkspaceSettings = {
        ...withGoogleApp(settings, change.clientId),
        organizationName: admin.organizationName,
        adminEmail: admin.email,
        grantedScopes: grant.tokens.scopes,
      };
      await transact((tx) =>
        connectedApps.changeConnection(ctx, tx, connection.id, {
          settings: { ...changed },
          secrets: { clientSecret: change.clientSecret, refreshToken: grant.tokens.refreshToken },
        }),
      );
      logger.info({ connectionId: connection.id }, "Google app changed");
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

/** Google's address for an offline consent to every scope the scans read. */
async function workspaceConsentUrl(
  google: GoogleClient,
  request: { clientId: string; redirectUri: string; state: string; nonce: string },
): Promise<string> {
  const { authorizationEndpoint } = await google.discover();
  return consentUrl(
    authorizationEndpoint,
    { ...request, scopes: GOOGLE_WORKSPACE_SCOPES },
    OFFLINE_CONSENT,
  );
}

/** The Google Workspace connection; refuses with CONFLICT before it exists. */
async function requireConnection(connectedApps: ConnectedApps, orm: Orm) {
  const connection = await connectedApps.readConnection(orm, GOOGLE_WORKSPACE);
  if (!connection) {
    throw new ApplicationError("CONFLICT", "Google Workspace is not connected.");
  }
  return connection;
}

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
    previousClientIds: [],
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
      connector: GOOGLE_WORKSPACE,
      app: { name: "Google Workspace", domain: null },
      settings: { ...settings },
      secrets: { clientSecret: consent.clientSecret, refreshToken: grant.tokens.refreshToken },
    });
    const scan = { connectionId, sourceName: admin.domain };
    const { sourceId } = await scans.scanConnection(owner, tx, scan);
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
