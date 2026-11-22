import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import { extensionPairingRepository, type ExtensionPairingRepository } from "../db";
import { type ExtensionPairing, parseBrowserLabel } from "../domain";
import {
  formatPairingToken,
  hashTokenSecret,
  newTokenSecret,
  openPairingCode,
  type PairingCode,
  parsePairingToken,
  sealPairingCode,
  secretMatches,
} from "../helpers";

/**
 * Pairing a user's Chrome with this instance: the owner starts it in Settings with a one-time code,
 * the extension redeems the code for a token, and then calls the instance with that token.
 */
export interface ExtensionPairingService {
  /** A one-time code pairing the caller's Chrome, valid five minutes from `now`. Needs MANAGE_WORKSPACE. */
  startPairing: (ctx: SecurityContext, input: { now: Date }) => Promise<{ code: string }>;
  /**
   * Pairs the browser for the user who started `code`, replacing their pairing; the token is shown
   * only here. Refuses an expired, used, changed or forged code, and a blank or over-long label.
   */
  redeemCode: (input: { code: string; browser: string; now: Date }) => Promise<{ token: string }>;
  /** The pairing `token` authenticates, seen at `now`; null for an unknown, replaced or malformed token. */
  readPairingOfToken: (input: { token: string; now: Date }) => Promise<ExtensionPairing | null>;
  /** Deletes the pairing `token` authenticates; false when it authenticates none. */
  unpairWithToken: (token: string) => Promise<boolean>;
  /** The caller's pairing; null when their Chrome is not paired. Needs MANAGE_WORKSPACE. */
  readPairing: (ctx: SecurityContext) => Promise<ExtensionPairing | null>;
  /** Deletes the caller's pairing, if any; its token stops working. Needs MANAGE_WORKSPACE. */
  unpair: (ctx: SecurityContext) => Promise<void>;
}

export function createExtensionPairingService({
  orm,
  secretBox,
  logger,
}: {
  orm: Orm;
  secretBox: SecretBox;
  logger: Logger;
}): ExtensionPairingService {
  const pairings = extensionPairingRepository(orm);
  // shortcut: one API process keeps the used codes in memory; share them in Postgres once the API runs as several processes.
  const usedCodes = new Map<string, number>();
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- A refusal rejects, as in every other operation.
    startPairing: async (ctx, { now }) => {
      const userId = pairingUserOf(ctx);
      logger.info({ userId }, "Extension pairing started");
      return { code: sealPairingCode(secretBox, userId, now) };
    },
    redeemCode: async ({ code, browser, now }) => {
      const label = parseBrowserLabel(browser);
      const opened = openPairingCode(secretBox, code, now);
      if (!opened || !claimOnce(usedCodes, opened, now)) {
        logger.warn("Extension pairing code refused");
        throw invalidInput([{ field: "code", code: "invalid" }]);
      }
      const secret = newTokenSecret();
      const pairing = await pairings.save({
        userId: opened.userId,
        tokenHash: hashTokenSecret(secret),
        browser: label,
        pairedAt: now,
      });
      logger.info({ pairingId: pairing.id, userId: pairing.userId }, "Extension paired");
      return { token: formatPairingToken({ pairingId: pairing.id, secret }) };
    },
    readPairingOfToken: async ({ token, now }) => {
      const pairing = await authenticate(pairings, token, logger);
      return pairing && pairings.touch(pairing.id, now);
    },
    unpairWithToken: async (token) => {
      const pairing = await authenticate(pairings, token, logger);
      if (!pairing) {
        return false;
      }
      await pairings.delete(pairing.id);
      logger.info(
        { pairingId: pairing.id, userId: pairing.userId },
        "Extension unpaired in Chrome",
      );
      return true;
    },
    readPairing: async (ctx) => pairings.findByUser(pairingUserOf(ctx)),
    unpair: async (ctx) => {
      const userId = pairingUserOf(ctx);
      await pairings.deleteByUser(userId);
      logger.info({ userId }, "Extension unpaired in Settings");
    },
  };
}

/** The signed-in admin whose Chrome a call is about; anyone else is refused. */
function pairingUserOf(ctx: SecurityContext): string {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user) {
    throw new ApplicationError("FORBIDDEN", "Only a signed-in admin pairs their Chrome.");
  }
  return ctx.user.userId;
}

/** The pairing `token` authenticates; null for a malformed token or one whose secret differs. */
async function authenticate(
  pairings: ExtensionPairingRepository,
  token: string,
  logger: Logger,
): Promise<ExtensionPairing | null> {
  const parsed = parsePairingToken(token);
  const found = parsed && (await pairings.findWithTokenHash(parsed.pairingId));
  if (found && secretMatches(parsed.secret, found.tokenHash)) {
    return found.pairing;
  }
  // Expected after unpairing or pairing again; the id says which pairing a token claimed.
  logger.info({ pairingId: parsed?.pairingId ?? null }, "Extension token refused");
  return null;
}

/** Marks `code` used; false when it already was. Forgets codes that have expired by `now`. */
function claimOnce(usedCodes: Map<string, number>, code: PairingCode, now: Date): boolean {
  for (const [nonce, expiresAt] of usedCodes) {
    if (expiresAt <= now.getTime()) {
      usedCodes.delete(nonce);
    }
  }
  if (usedCodes.has(code.nonce)) {
    return false;
  }
  usedCodes.set(code.nonce, code.expiresAt);
  return true;
}
