import type { Orm } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecretBox } from "../../../core/secrets";
import type {
  ConnectionSignInAnswer,
  ConnectorErrorCode,
} from "@broccoli-access/connector-contract";

import type { ConnectorsContainerClient } from "../../../integrations/connectorsContainer";
import { integrationUserRepository } from "../db";
import {
  INTEGRATION_USER_SECRETS,
  type IntegrationUserSecrets,
  type IntegrationUserSignIn,
  type IntegrationUserSignInFailure,
} from "../domain";

/**
 * Signing in to Google as the integration user: the connectors container's browser signs in and
 * sets up its two-step sign-in, and the secret it answers is stored with the password.
 */
export interface IntegrationUserSignInAttempts {
  /** Starts an attempt in the background with the stored secrets, unless one runs. */
  start(): void;
  /** Where signing in stands: the stored two-step secret first, then this process's attempt. */
  read(): Promise<IntegrationUserSignIn>;
}

export interface IntegrationUserSignInDependencies {
  orm: Orm;
  secretBox: SecretBox;
  logger: Logger;
  /** The connectors container, whose browser signs in; null when none is configured. */
  connectorsContainer: Pick<
    ConnectorsContainerClient,
    "setUpIntegrationUser" | "signInToApp"
  > | null;
}

/**
 * The connection the connectors container made by signing in to an app as the integration user,
 * or why it made none: the container's error, or `not_set_up` until the integration user signs in
 * to Google with two steps.
 */
export type AppSignIn = ConnectionSignInAnswer | { failure: ConnectorErrorCode | "not_set_up" };

export function createIntegrationUserSignInAttempts(
  dependencies: IntegrationUserSignInDependencies,
): IntegrationUserSignInAttempts {
  // shortcut: the running and the last attempt live in this process's memory, so a restart shows
  // "setup did not finish" until the owner tries again, and two processes would each run one;
  // store the attempt with the integration user if the API ever runs as more than one process.
  let running: Promise<void> | undefined;
  let lastFailure: IntegrationUserSignInFailure | undefined;
  return {
    start() {
      running ??= signIn(dependencies).then((failure) => {
        lastFailure = failure;
        running = undefined;
      });
    },
    async read() {
      // Noted before the read: an attempt that ends during it must not read as failed.
      const wasRunning = running !== undefined;
      const secrets = await readSecrets(dependencies);
      if (secrets?.totpSecret !== undefined) {
        return { status: "signs_in_with_two_step_sign_in", failure: null };
      }
      return wasRunning || running
        ? { status: "setting_up_two_step_sign_in", failure: null }
        : { status: "sign_in_needs_owner", failure: lastFailure ?? "sign_in_did_not_finish" };
    },
  };
}

/** Signs in to the connector's app as the integration user, sending its secrets to the container only. */
export async function signInToApp(
  dependencies: IntegrationUserSignInDependencies,
  connector: string,
): Promise<AppSignIn> {
  const { orm, connectorsContainer, logger } = dependencies;
  const [user, secrets] = await Promise.all([
    integrationUserRepository(orm).find(),
    readSecrets(dependencies),
  ]);
  if (!user || secrets?.totpSecret === undefined) {
    return { failure: "not_set_up" };
  }
  const { password, totpSecret } = secrets;
  const signedIn = (await connectorsContainer?.signInToApp({
    connector,
    integrationUser: { email: user.email, password, totpSecret },
    connection: null,
  })) ?? { error: "app_unavailable" as const };
  if ("error" in signedIn) {
    logger.warn(
      { connector, failure: signedIn.error },
      "Integration user could not sign in to the app",
    );
    return { failure: signedIn.error };
  }
  logger.info({ connector }, "Integration user signed in to the app");
  return signedIn.answer;
}

/** The integration user's secrets as its row holds them, bound to that table. */
export function encryptIntegrationUserSecrets(
  secretBox: SecretBox,
  secrets: IntegrationUserSecrets,
): string {
  return secretBox.encrypt(JSON.stringify(secrets), SECRETS_ASSOCIATED_DATA);
}

/** Binds the encrypted secrets to their table, so no other ciphertext of the instance passes as them. */
const SECRETS_ASSOCIATED_DATA = "integration_user";

/** One attempt: why it failed, or undefined once the two-step secret is stored. Never rejects. */
async function signIn(
  dependencies: IntegrationUserSignInDependencies,
): Promise<IntegrationUserSignInFailure | undefined> {
  const { logger } = dependencies;
  try {
    const failed = await setUpTwoStepSignIn(dependencies);
    if (failed) {
      logger.warn(failed, "Integration user could not sign in to Google");
    } else {
      logger.info("Integration user signs in to Google with two-step sign-in");
    }
    return failed?.failure;
  } catch (error) {
    logger.error(
      { kind: error instanceof Error ? error.name : typeof error },
      "Integration user sign-in failed unexpectedly",
    );
    return "sign_in_did_not_finish";
  }
}

// shortcut: the container turns two-step sign-in on before the core stores the secret it answers,
// so an answer lost on the way, or a restart then, leaves a user nobody holds the secret of; the
// owner then resets its two-step sign-in in Google admin. Fix it in the contract if it happens.
async function setUpTwoStepSignIn({
  orm,
  secretBox,
  connectorsContainer,
}: IntegrationUserSignInDependencies): Promise<FailedSignIn | undefined> {
  const repository = integrationUserRepository(orm);
  const [user, secrets] = await Promise.all([repository.find(), readSecrets({ orm, secretBox })]);
  if (!user || !secrets) {
    return { failure: "sign_in_did_not_finish" };
  }
  if (!connectorsContainer) {
    return { failure: "connectors_container_unavailable" };
  }
  const { password, totpSecret = null } = secrets;
  const setup = await connectorsContainer.setUpIntegrationUser({
    integrationUser: { email: user.email, password, totpSecret },
  });
  if ("error" in setup) {
    return {
      failure: SIGN_IN_FAILURES[setup.error] ?? "sign_in_did_not_finish",
      connectorError: setup.error,
    };
  }
  // A stored secret works already, and the contract answers the same one: never replace it.
  if (totpSecret === null) {
    await repository.replaceEncryptedSecrets(
      encryptIntegrationUserSecrets(secretBox, { password, totpSecret: setup.answer.totpSecret }),
    );
  }
  return undefined;
}

/** Why an attempt failed, with the container's error when it answered one, for the log. */
interface FailedSignIn {
  failure: IntegrationUserSignInFailure;
  connectorError?: string;
}

/** The container's errors the owner is told apart; every other one reads as an unfinished setup. */
const SIGN_IN_FAILURES: Partial<Record<string, IntegrationUserSignInFailure>> = {
  blocked_by_check: "blocked_by_check",
  authentication_failed: "authentication_failed",
  app_unavailable: "connectors_container_unavailable",
};

async function readSecrets({
  orm,
  secretBox,
}: Pick<IntegrationUserSignInDependencies, "orm" | "secretBox">): Promise<
  IntegrationUserSecrets | undefined
> {
  const encrypted = await integrationUserRepository(orm).findEncryptedSecrets();
  if (encrypted === null) {
    return undefined;
  }
  return INTEGRATION_USER_SECRETS.parse(
    JSON.parse(secretBox.decrypt(encrypted, SECRETS_ASSOCIATED_DATA)),
  );
}
