import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { SecurityContext } from "../../../core/security";
import { createGoogleClient } from "../../../integrations/google";
import { openConsentState } from "../helpers";
import { verifyWriteGrant } from "./integrationUserDirectory";
import type { GoogleConnectionDependencies } from "./googleConnectionService";
import {
  googleAppChanged,
  readOwnGoogleApp,
  startWriteConsent,
  saveWriteGrant,
} from "./userWriteGrant";

/**
 * The owner's consent to change the directory's users, asked for when a feature first needs it,
 * such as offboarding: setup's consent only reads.
 */
export interface UserWriteConsentService {
  /**
   * For the owner: Google's consent address for the one scope that changes users, added to what
   * the Google app was granted, its `state` carrying `returnTo`, encrypted for `browserToken`, a
   * new token the caller keeps in this browser until Google answers. Refuses a `returnTo` that is
   * no path of this instance with INVALID_INPUT, another caller with FORBIDDEN, and with CONFLICT
   * before Google Workspace is connected with the instance's own Google app.
   */
  start: (
    ctx: SecurityContext,
    start: UserWriteConsentStart,
  ) => Promise<{ authorizationUrl: string; browserToken: string }>;
  /**
   * Google's answer to that consent: stores the connection's grown grant and returns where the
   * owner came from. Refuses a consent without the scope with `UserWriteRefusedError`, a consent
   * from elsewhere like a Google app change does, an answer it cannot trust with INVALID_INPUT,
   * and a connection changed meanwhile with CONFLICT; the connection then stays as it was.
   */
  finish: (ctx: SecurityContext, answer: UserWriteConsentAnswer) => Promise<{ returnTo: string }>;
  /** Where the owner of this state came from, to send them back after a failure; null when it cannot be opened. */
  readReturnTo: (
    answer: Pick<UserWriteConsentAnswer, "state" | "browserToken" | "now">,
  ) => string | null;
}

export interface UserWriteConsentStart {
  /** The instance's own path, with an optional query, the owner returns to. */
  returnTo: string;
  /** Where browsers reach the instance; Google redirects to its callback there. */
  publicOrigin: string;
  now: Date;
}

/** Google's redirect back after the owner answered the consent. */
export interface UserWriteConsentAnswer {
  code?: string;
  handle?: string;
  state: string;
  publicOrigin: string;
  /** The token `start` gave the browser; null when the browser has none. */
  browserToken: string | null;
  now: Date;
}

export type UserWriteConsentDependencies = Pick<
  GoogleConnectionDependencies,
  | "orm"
  | "transact"
  | "secretBox"
  | "logger"
  | "openIdConfigurationUrl"
  | "adminApiUrl"
  | "connectedApps"
>;

export function createUserWriteConsentService(
  dependencies: UserWriteConsentDependencies,
): UserWriteConsentService {
  const { orm, transact, secretBox, connectedApps, logger } = dependencies;
  const google = createGoogleClient(dependencies);
  const openState = ({
    state,
    browserToken,
    now,
  }: Pick<UserWriteConsentAnswer, "state" | "browserToken" | "now">) => {
    const opened =
      browserToken === null ? null : openConsentState(secretBox, state, { browserToken, now });
    return opened?.flow === "allow_user_writes" ? opened : null;
  };
  return {
    async start(ctx, { returnTo, publicOrigin, now }) {
      requireOwner(ctx);
      if (!OWN_PATH.test(returnTo)) {
        throw invalidInput([{ field: "returnTo", code: "invalid" }]);
      }
      const { settings, revision } = await readOwnGoogleApp(connectedApps, orm);
      return startWriteConsent({ google, secretBox }, { settings, publicOrigin, now }, (nonce) => ({
        flow: "allow_user_writes",
        returnTo,
        revision,
        nonce,
      }));
    },
    async finish(ctx, answer) {
      requireOwner(ctx);
      const consent = openState(answer);
      if (!consent) {
        throw new ApplicationError(
          "INVALID_INPUT",
          "The consent expired or was not this browser's.",
        );
      }
      const googleApp = await readOwnGoogleApp(connectedApps, orm);
      if (googleApp.revision !== consent.revision) {
        throw googleAppChanged();
      }
      const grant = await verifyWriteGrant(google, googleApp, { ...answer, nonce: consent.nonce });
      const saved = await transact((tx) =>
        saveWriteGrant(connectedApps, ctx, tx, googleApp, grant),
      );
      if (!saved) {
        throw googleAppChanged();
      }
      logger.info({ connectionId: googleApp.connectionId }, "Google user writes allowed");
      return { returnTo: consent.returnTo };
    },
    readReturnTo: (answer) => openState(answer)?.returnTo ?? null,
  };
}

/**
 * A path of this instance with an optional plain query: never another origin, which `//host` and
 * a scheme would name, so the callback's redirect cannot leave the instance.
 */
const OWN_PATH = /^\/(?!\/)[\w\-/]*(\?[\w\-=&]*)?$/;

/** Refuses everyone but the owner, the system included, with FORBIDDEN. */
function requireOwner(ctx: SecurityContext): void {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user?.isOwner) {
    throw new ApplicationError("FORBIDDEN", "Only the owner can allow changing Google users.");
  }
}
