import { randomBytes } from "node:crypto";

import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { createConnectorsContainerClient } from "../../../integrations/connectorsContainer";
import { createGoogleClient, type GoogleClient } from "../../../integrations/google";
import { integrationUserRepository } from "../db";
import {
  type IntegrationUser,
  type IntegrationUserSignIn,
  parseIntegrationUserEmail,
} from "../domain";
import {
  findIntegrationAccountEmail,
  isIntegrationUserSuspended,
} from "./findIntegrationAccountEmail";
import type { ScannedMembers } from "../ports";
import type { GoogleConnectionDependencies } from "./googleConnectionService";
import { createDirectoryUser } from "./integrationUserDirectory";
import {
  type AppSignIn,
  createIntegrationUserSignInAttempts,
  encryptIntegrationUserSecrets,
  signInToApp,
} from "./integrationUserSignIn";
import {
  type ConnectedGoogleApp,
  type WriteConsent,
  type WriteConsentDestination,
  type WriteGrant,
  googleAppChanged,
  openWriteConsent,
  readConnectedGoogleApp,
  saveWriteGrant,
  startWriteConsent,
  verifyWriteGrant,
} from "./userWriteGrant";

/**
 * The integration user: the Google Workspace user Broccoli Access creates for itself, once the
 * owner allows it to create users, and signs in to Google as it by itself. It sends the
 * password to Google to create the user, and its secrets to the connectors container to sign in;
 * no caller reads them.
 */
export interface IntegrationUserService {
  /**
   * For the owner: Google's consent address for the one scope that creates users, added to what
   * the Google app was granted. The consent binds the chosen address to this browser until Google
   * answers. Refuses an
   * address outside the workspace's domain with INVALID_INPUT, another caller with FORBIDDEN, and
   * with CONFLICT before Google Workspace is connected or once the integration user exists.
   */
  startCreation: (
    ctx: SecurityContext,
    start: IntegrationUserStart,
  ) => Promise<WriteConsentDestination>;
  /**
   * Google's answer to that consent: creates the user in the directory with a random password,
   * then stores it, with the password encrypted, and the connection's grown grant, and queues a
   * scan of the directory, in one transaction. Refuses a consent without the scope with `UserWriteRefusedError`, a taken address
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
  /**
   * Signs in to the app of the container's `connector` as the integration user and answers the
   * connection with its new session, or why not. Its secrets go to the container only. Admins only.
   */
  signInToApp: (
    ctx: SecurityContext,
    connector: string,
    /** The stored connection when renewing its session; left out for a first sign-in. */
    renewing?: { settings: Record<string, unknown>; secrets: Record<string, unknown> },
  ) => Promise<AppSignIn>;
  /** Whether the directory's last scan found the integration user suspended. Trusted read. */
  isSuspendedInDirectory: (db: Orm | Tx) => Promise<boolean>;
  /** The integration user as Settings shows it, its id the directory's; null before it exists. Owner only. */
  readIntegrationUser: (
    ctx: SecurityContext,
  ) => Promise<{ id: string; email: string; signIn: IntegrationUserSignIn } | null>;
  /** The email to recognise in other apps, from the directory member with Google's stable id. Trusted read. */
  findIntegrationAccountEmail: (db: Orm | Tx) => Promise<string | null>;
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
  | "relayUrl"
  | "publicUrl"
  | "connectedApps"
  | "scans"
> & {
  /** `CONNECTORS_URL`: the connectors container, whose browser signs in; unset means none. */
  connectorsUrl?: string;
  records: ScannedMembers;
};

export function createIntegrationUserService(
  dependencies: IntegrationUserDependencies,
): IntegrationUserService {
  const { orm, secretBox, connectedApps } = dependencies;
  const google = createGoogleClient(dependencies);
  const signInDependencies = {
    ...dependencies,
    connectorsContainer: dependencies.connectorsUrl
      ? createConnectorsContainerClient(dependencies.connectorsUrl)
      : null,
  };
  const signIn = createIntegrationUserSignInAttempts(signInDependencies);
  // shortcut: one creation at a time in this process, so two answers at once never create two
  // users in Google; that holds while the API runs as one process. Reserve the row in Postgres
  // before calling Google if it ever runs as more.
  let isCreating = false;
  return {
    async startCreation(ctx, { email: input, publicOrigin, now }) {
      requireOwner(ctx);
      const googleApp = await readConnectedGoogleApp(connectedApps, orm);
      const parsed = parseIntegrationUserEmail(input, googleApp.settings.domain);
      if ("problem" in parsed) {
        throw invalidInput([{ field: "email", code: parsed.problem }]);
      }
      await refuseSecondIntegrationUser(orm);
      return startWriteConsent({ ...dependencies, google }, googleApp, {
        flow: "create_integration_user",
        email: parsed.email,
        publicOrigin,
        now,
      });
    },
    async finishCreation(ctx, answer) {
      const createdBy = requireOwner(ctx);
      const creation = openWriteConsent(secretBox, answer);
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
          consent: creation,
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
    signInToApp(ctx, connector, renewing) {
      ctx.require("MANAGE_WORKSPACE");
      return signInToApp(signInDependencies, connector, renewing);
    },
    isSuspendedInDirectory: (db) => isIntegrationUserSuspended(db, dependencies),
    async readIntegrationUser(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      const found = await integrationUserRepository(orm).find();
      return found && { id: found.googleUserId, email: found.email, signIn: await signIn.read() };
    },
    findIntegrationAccountEmail: (db) => findIntegrationAccountEmail(db, dependencies),
    async readGoogleUserId(ctx, db) {
      ctx.requireSystem();
      return (await integrationUserRepository(db).find())?.googleUserId ?? null;
    },
  };
}

/** 256 random bits, as 43 characters: beyond guessing and inside Google's 100. */
const PASSWORD_BYTES = 32;

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
  answer: IntegrationUserAnswer & {
    consent: Extract<WriteConsent, { flow: "create_integration_user" }>;
    createdBy: string;
  },
): Promise<void> {
  const { orm, connectedApps } = dependencies;
  const { createdBy, now, consent } = answer;
  const { email } = consent;
  await refuseSecondIntegrationUser(orm);
  const googleApp = await readConnectedGoogleApp(connectedApps, orm);
  const grant = await verifyWriteGrant({ ...dependencies, google }, googleApp, answer);
  const password = randomPassword();
  const googleUserId = await createDirectoryUser(google, grant.accessToken, { email, password });
  await saveIntegrationUser(dependencies, ctx, {
    googleApp,
    grant,
    created: { email, googleUserId, password, createdBy, createdAt: now },
  });
}

async function refuseSecondIntegrationUser(db: Orm | Tx): Promise<void> {
  if (await integrationUserRepository(db).find()) {
    throw integrationUserExists();
  }
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
  { transact, secretBox, connectedApps, scans, logger }: IntegrationUserDependencies,
  ctx: SecurityContext,
  {
    googleApp,
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
  const { connectionId } = googleApp;
  try {
    await transact(async (tx) => {
      const stored = await integrationUserRepository(tx).insert({ ...created, encryptedSecrets });
      if (!stored) {
        throw integrationUserExists();
      }
      const saved = await saveWriteGrant(connectedApps, ctx, tx, googleApp, grant);
      if (!saved) {
        throw googleAppChanged();
      }
      // Its accounts in other apps are known by the email the directory's next scan reads.
      await scans.scanConnection(ctx, tx, { connectionId, sourceName: googleApp.settings.domain });
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
