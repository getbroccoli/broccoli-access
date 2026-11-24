import { randomBytes } from "node:crypto";

import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { createConnectorsContainerClient } from "../../../integrations/connectorsContainer";
import { createGoogleClient, type GoogleClient } from "../../../integrations/google";
import { integrationUserRepository } from "../db";
import {
  GOOGLE_USER_WRITE_SCOPE,
  GOOGLE_WORKSPACE,
  GOOGLE_WORKSPACE_SECRETS,
  googleRedirectAddress,
  type GoogleWorkspaceSettings,
  type IntegrationUser,
  type IntegrationUserSignIn,
  parseGoogleWorkspaceSettings,
  parseIntegrationUserEmail,
} from "../domain";
import { openConsentState, randomConsentToken, sealConsentState } from "../helpers";
import type { ConnectedApps } from "../ports";
import { consentUrl } from "./consentUrl";
import type { GoogleConnectionDependencies } from "./googleConnectionService";
import { createDirectoryUser, verifyWriteGrant, type WriteGrant } from "./integrationUserDirectory";
import {
  createIntegrationUserSignInAttempts,
  encryptIntegrationUserSecrets,
} from "./integrationUserSignIn";

/**
 * The integration user: the Google Workspace user Broccoli Access creates for itself, once the
 * owner allows it to create users, and signs in to Google as it by itself. Its password goes to
 * Google once, to create it; after that its secrets leave this service only for the connectors
 * container, and no caller reads them.
 */
export interface IntegrationUserService {
  /**
   * For the owner: Google's consent address for the one scope that creates users, added to what
   * the Google app was granted, its `state` carrying the address picked, encrypted for
   * `browserToken`, a new token the caller keeps in this browser until Google answers. Refuses an
   * address outside the workspace's domain with INVALID_INPUT, another caller with FORBIDDEN, and
   * with CONFLICT before Google Workspace is connected with the instance's own Google app, or once
   * the integration user exists.
   */
  startCreation: (
    ctx: SecurityContext,
    start: IntegrationUserStart,
  ) => Promise<{ authorizationUrl: string; browserToken: string }>;
  /**
   * Google's answer to that consent: creates the user in the directory with a random password,
   * then stores it, with the password encrypted, and the connection's grown grant in one
   * transaction. Refuses a consent without the scope with `UserWriteRefusedError`, a taken address
   * with `EmailTakenError`, a consent from elsewhere like a Google app change does, an answer it
   * cannot trust with INVALID_INPUT, and with CONFLICT once the integration user exists or while
   * another answer creates it; nothing is created or stored then. Once stored, it starts signing
   * in as the user, like `startSignIn`, without waiting for it.
   */
  finishCreation: (ctx: SecurityContext, answer: IntegrationUserAnswer) => Promise<void>;
  /**
   * For the owner: starts signing in to Google as the integration user through the connectors
   * container, which sets up its two-step sign-in, unless an attempt runs; `readIntegrationUser`
   * tells how it ended. Refuses another caller with FORBIDDEN, and with CONFLICT before the
   * integration user exists.
   */
  startSignIn: (ctx: SecurityContext) => Promise<void>;
  /** The integration user as Settings shows it, its id the directory's; null before it exists. Owner only. */
  readIntegrationUser: (
    ctx: SecurityContext,
  ) => Promise<{ id: string; email: string; signIn: IntegrationUserSignIn } | null>;
  /** The directory's id of the integration user, which the sync skips; null before it exists. System only. */
  readGoogleUserId: (ctx: SecurityContext, db: Orm | Tx) => Promise<string | null>;
}

/** What the owner sends to create the integration user. */
export interface IntegrationUserStart {
  /** The address picked for it. */
  email: string;
  /** Where browsers reach the instance; Google redirects to its callback there. */
  publicOrigin: string;
  now: Date;
}

/** Google's redirect back after the owner allowed creating users. */
export interface IntegrationUserAnswer {
  code?: string;
  handle?: string;
  state: string;
  publicOrigin: string;
  /** The token `startCreation` gave the browser; null when the browser has none. */
  browserToken: string | null;
  now: Date;
}

export type IntegrationUserDependencies = Pick<
  GoogleConnectionDependencies,
  | "orm"
  | "transact"
  | "secretBox"
  | "logger"
  | "openIdConfigurationUrl"
  | "adminApiUrl"
  | "connectedApps"
> & {
  /** `CONNECTORS_URL`: the connectors container, whose browser signs in; unset means none. */
  connectorsUrl?: string;
};

export function createIntegrationUserService(
  dependencies: IntegrationUserDependencies,
): IntegrationUserService {
  const { orm, secretBox, connectedApps } = dependencies;
  const google = createGoogleClient(dependencies);
  const signIn = createIntegrationUserSignInAttempts({
    ...dependencies,
    connectorsContainer: dependencies.connectorsUrl
      ? createConnectorsContainerClient(dependencies.connectorsUrl)
      : null,
  });
  // shortcut: one creation at a time in this process, so two answers at once never create two
  // users in Google; that holds while the API runs as one process. Reserve the row in Postgres
  // before calling Google if it ever runs as more.
  let isCreating = false;
  return {
    async startCreation(ctx, { email: input, publicOrigin, now }) {
      requireOwner(ctx);
      const { settings, revision } = await readOwnGoogleApp(connectedApps, orm);
      const parsed = parseIntegrationUserEmail(input, settings.domain);
      if ("problem" in parsed) {
        throw invalidInput([{ field: "email", code: parsed.problem }]);
      }
      await refuseSecondIntegrationUser(orm);
      const nonce = randomConsentToken();
      const browserToken = randomConsentToken();
      const state = sealConsentState(
        secretBox,
        { flow: "create_integration_user", email: parsed.email, revision, nonce },
        { browserToken, now },
      );
      const { authorizationEndpoint } = await google.discover();
      const authorizationUrl = consentUrl(
        authorizationEndpoint,
        {
          clientId: settings.clientId,
          redirectUri: googleRedirectAddress(publicOrigin),
          scopes: CREATION_SCOPES,
          state,
          nonce,
        },
        INCREMENTAL_OFFLINE_CONSENT,
      );
      return { authorizationUrl, browserToken };
    },
    async finishCreation(ctx, answer) {
      const createdBy = requireOwner(ctx);
      const { browserToken, now } = answer;
      const creation =
        browserToken === null
          ? null
          : openConsentState(secretBox, answer.state, { browserToken, now });
      if (creation?.flow !== "create_integration_user") {
        throw new ApplicationError(
          "INVALID_INPUT",
          "The consent expired or was not this browser's.",
        );
      }
      if (isCreating) {
        throw new ApplicationError("CONFLICT", "The integration user is being created.");
      }
      isCreating = true;
      try {
        await createFromConsent(dependencies, google, ctx, {
          ...answer,
          email: creation.email,
          nonce: creation.nonce,
          revision: creation.revision,
          createdBy,
        });
      } finally {
        isCreating = false;
      }
      signIn.start();
    },
    async startSignIn(ctx) {
      requireOwner(ctx);
      if (!(await integrationUserRepository(orm).find())) {
        throw new ApplicationError("CONFLICT", "The integration user does not exist.");
      }
      signIn.start();
    },
    async readIntegrationUser(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      const found = await integrationUserRepository(orm).find();
      return found && { id: found.googleUserId, email: found.email, signIn: await signIn.read() };
    },
    async readGoogleUserId(ctx, db) {
      ctx.requireSystem();
      return (await integrationUserRepository(db).find())?.googleUserId ?? null;
    },
  };
}

/**
 * The one new scope, and `openid` so that Google's answer always says who consented, also when
 * another account than the connected admin does.
 */
const CREATION_SCOPES = ["openid", GOOGLE_USER_WRITE_SCOPE];

/**
 * Asks only for the scopes in the request and keeps the ones granted before in the new grant; a
 * consent asked now and offline gives the refresh token that holds them all.
 */
const INCREMENTAL_OFFLINE_CONSENT = {
  include_granted_scopes: "true",
  access_type: "offline",
  prompt: "consent",
};

/** 256 random bits, as 43 characters: beyond guessing and inside Google's 100. */
const PASSWORD_BYTES = 32;

/** The Google Workspace connection with its own Google app's secret, as one stored version. */
interface ConnectedGoogleApp {
  connectionId: string;
  settings: GoogleWorkspaceSettings;
  clientSecret: string;
  /** The stored version read, which the save replaces or refuses. */
  revision: string;
}

/** The owner's user id; refuses everyone else, the system included, with FORBIDDEN. */
function requireOwner(ctx: SecurityContext): string {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user?.isOwner) {
    throw new ApplicationError("FORBIDDEN", "Only the owner can create the integration user.");
  }
  return ctx.user.userId;
}

/** Verifies Google's answer, creates the user in the directory and stores it. */
async function createFromConsent(
  dependencies: IntegrationUserDependencies,
  google: GoogleClient,
  ctx: SecurityContext,
  consent: Omit<IntegrationUserAnswer, "state" | "browserToken"> & {
    email: string;
    nonce: string;
    revision: string;
    createdBy: string;
  },
): Promise<void> {
  const { orm, connectedApps } = dependencies;
  const { email, createdBy, now } = consent;
  await refuseSecondIntegrationUser(orm);
  const googleApp = await readOwnGoogleApp(connectedApps, orm);
  if (googleApp.revision !== consent.revision) {
    throw googleAppChanged();
  }
  const grant = await verifyWriteGrant(google, googleApp, consent);
  const password = randomPassword();
  const googleUserId = await createDirectoryUser(google, grant.accessToken, { email, password });
  await saveIntegrationUser(dependencies, ctx, {
    googleApp,
    grant,
    created: { email, googleUserId, password, createdBy, createdAt: now },
  });
}

// shortcut: the Broccoli Google app's relay asks for its own fixed scopes, so only a connection
// with the instance's own Google app can add the write scope; teach the relay the scope to lift this.
/** The connection's own Google app; refuses with CONFLICT before it exists or with the Broccoli app. */
async function readOwnGoogleApp(
  connectedApps: ConnectedApps,
  orm: Orm,
): Promise<ConnectedGoogleApp> {
  const connection = await connectedApps.readConnection(orm, GOOGLE_WORKSPACE);
  const stored = connection && (await connectedApps.readConnectionWithSecrets(orm, connection.id));
  if (!stored) {
    throw new ApplicationError("CONFLICT", "Google Workspace is not connected.");
  }
  const settings = parseGoogleWorkspaceSettings(stored.connection.settings);
  const { clientSecret } = GOOGLE_WORKSPACE_SECRETS.parse(stored.secrets);
  if (settings.googleApp !== "own_google_app" || clientSecret === undefined) {
    throw new ApplicationError("CONFLICT", "The integration user needs your own Google app.");
  }
  return { connectionId: stored.connection.id, settings, clientSecret, revision: stored.revision };
}

async function refuseSecondIntegrationUser(db: Orm | Tx): Promise<void> {
  if (await integrationUserRepository(db).find()) {
    throw integrationUserExists();
  }
}

/** The connection is no longer the version the consent started from, such as after a reconnect. */
function googleAppChanged(): ApplicationError {
  return new ApplicationError("CONFLICT", "The Google app changed during consent. Try again.");
}

function integrationUserExists(): ApplicationError {
  return new ApplicationError("CONFLICT", "The integration user already exists.");
}

// shortcut: the directory user exists before its row, since no transaction spans Google, so a
// failed save, or a second creation finishing at the same moment from another browser, leaves a
// user in Google without a row, logged by its id; delete it through Google once the fake and the
// connector can.
/** Stores the created user and the connection's grown grant together, then logs the outcome. */
async function saveIntegrationUser(
  { transact, secretBox, connectedApps, logger }: IntegrationUserDependencies,
  ctx: SecurityContext,
  {
    googleApp: { connectionId, settings, clientSecret, revision },
    grant,
    created: { password, ...created },
  }: {
    googleApp: ConnectedGoogleApp;
    grant: WriteGrant;
    created: IntegrationUser & { password: string };
  },
): Promise<void> {
  const encryptedSecrets = encryptIntegrationUserSecrets(secretBox, { password });
  const { googleUserId } = created;
  try {
    await transact(async (tx) => {
      const stored = await integrationUserRepository(tx).insert({ ...created, encryptedSecrets });
      if (!stored) {
        throw integrationUserExists();
      }
      const saved = await connectedApps.changeConnection(ctx, tx, connectionId, {
        settings: { ...settings, adminEmail: grant.adminEmail, grantedScopes: grant.scopes },
        secrets: { clientSecret, refreshToken: grant.refreshToken },
        replacingRevision: revision,
      });
      if (!saved) {
        throw googleAppChanged();
      }
    });
  } catch (error) {
    logger.error(
      { connectionId, googleUserId, kind: error instanceof Error ? error.name : typeof error },
      "Integration user created in Google but not stored",
    );
    throw error;
  }
  logger.info({ connectionId, googleUserId }, "Integration user created");
}

function randomPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString("base64url");
}
