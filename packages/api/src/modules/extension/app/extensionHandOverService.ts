import type { AppSessionRequest, AppSessions } from "../ports";
import type { ExtensionPairingService } from "./extensionPairingService";

/** The paired extension handing over an app session, each call authenticated by its token. */
export interface ExtensionHandOverService {
  /** What to collect for the connector's app session; null when `token` authenticates no pairing. */
  describeAppSession: (input: {
    token: string;
    connector: string;
    now: Date;
  }) => Promise<AppSessionRequest | null>;
  /**
   * Hands over the app session the extension collected, for the user `token` pairs; false when it
   * authenticates no pairing.
   */
  handOverAppSession: (input: {
    token: string;
    connector: string;
    requestId: string;
    appSession: unknown;
    now: Date;
  }) => Promise<boolean>;
}

export function createExtensionHandOverService({
  pairings,
  appSessions,
}: {
  pairings: Pick<ExtensionPairingService, "readPairingOfToken">;
  appSessions: AppSessions;
}): ExtensionHandOverService {
  return {
    describeAppSession: async ({ token, connector, now }) => {
      const pairing = await pairings.readPairingOfToken({ token, now });
      return pairing && appSessions.describeAppSession(connector);
    },
    handOverAppSession: async ({ token, now, ...handOver }) => {
      const pairing = await pairings.readPairingOfToken({ token, now });
      if (!pairing) {
        return false;
      }
      await appSessions.handOverAppSession({ ...handOver, userId: pairing.userId });
      return true;
    },
  };
}
