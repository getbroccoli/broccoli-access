import { APP_SESSION, type AppSession } from "@broccoli-access/connector-contract";
import { z } from "zod";

import type { ConnectionDetails } from "../../../core/connectors";
import type { SecretBox } from "../../../core/secrets";

/**
 * App sessions the extension handed over, each tested and sealed with the instance's key for the
 * user and connector, waiting for that user to connect within five minutes. Nothing reaches
 * Postgres before they connect.
 */
export interface AppSessionHandOvers {
  /** Seals the session and keeps it, with what the test found, as the user's `requestId`. */
  keep(handOver: {
    userId: string;
    requestId: string;
    connector: string;
    appSession: AppSession;
    details: ConnectionDetails;
  }): void;
  /** The user's hand-over `requestId` while unexpired; null otherwise. */
  read(userId: string, requestId: string): AppSessionHandOver | null;
  /** The session `sealed` holds for the user and connector while unexpired; null when changed, forged, expired or another's. */
  open(sealed: string, owner: { userId: string; connector: string }): AppSession | null;
}

/** A handed-over app session as the owner's page receives it. */
export interface AppSessionHandOver {
  /** The id the owner's page gave the hand-over. */
  requestId: string;
  organizationName: string;
  /** The workspace's address, such as `acme.slack.com`; null for an app without one. */
  domain: string | null;
  /** The session, sealed so only this instance reads it. */
  appSession: string;
}

export function createAppSessionHandOvers({
  secretBox,
  now,
}: {
  secretBox: SecretBox;
  now: () => Date;
}): AppSessionHandOvers {
  // shortcut: hand-overs live in this process's memory, so a restart, or a second API process, loses them and the owner hands over again; keep them in Postgres when that matters.
  const kept = new Map<string, KeptHandOver>();
  return {
    keep({ userId, requestId, connector, appSession, details }) {
      forgetExpired(kept, now());
      const expiresAt = now().getTime() + HAND_OVER_LIFETIME_MS;
      const sealed: SealedAppSession = { userId, connector, appSession, expiresAt };
      kept.set(keyOf(userId, requestId), {
        handOver: {
          requestId,
          organizationName: details.organizationName,
          domain: details.domain,
          appSession: secretBox.encrypt(JSON.stringify(sealed), ASSOCIATED_DATA),
        },
        expiresAt,
      });
    },
    read(userId, requestId) {
      forgetExpired(kept, now());
      return kept.get(keyOf(userId, requestId))?.handOver ?? null;
    },
    open(sealed, { userId, connector }) {
      const opened = openSealed(secretBox, sealed);
      const isOwnAndFresh =
        opened !== null &&
        opened.userId === userId &&
        opened.connector === connector &&
        opened.expiresAt > now().getTime();
      return isOwnAndFresh ? opened.appSession : null;
    },
  };
}

/** How long the owner has between handing a session over and connecting: five minutes. */
const HAND_OVER_LIFETIME_MS = 5 * 60_000;

/** Keeps any other ciphertext the instance makes, such as a pairing code, from passing as a session. */
const ASSOCIATED_DATA = "app-session-hand-over";

const SEALED_APP_SESSION = z.object({
  userId: z.string(),
  connector: z.string(),
  appSession: APP_SESSION,
  expiresAt: z.number(),
});

type SealedAppSession = z.infer<typeof SEALED_APP_SESSION>;

interface KeptHandOver {
  handOver: AppSessionHandOver;
  /** Epoch milliseconds from which it is forgotten. */
  expiresAt: number;
}

/** One user's request ids never meet another's. */
function keyOf(userId: string, requestId: string): string {
  return JSON.stringify([userId, requestId]);
}

function forgetExpired(kept: Map<string, KeptHandOver>, now: Date): void {
  for (const [key, { expiresAt }] of kept) {
    if (expiresAt <= now.getTime()) {
      kept.delete(key);
    }
  }
}

function openSealed(secretBox: SecretBox, sealed: string): SealedAppSession | null {
  try {
    return SEALED_APP_SESSION.parse(JSON.parse(secretBox.decrypt(sealed, ASSOCIATED_DATA)));
  } catch {
    return null;
  }
}
