import { useQuery } from "@apollo/client/react";
import { EXTENSION_ID, isPairableOrigin } from "@broccoli-access/extension";
import { useEffect, useState } from "react";

import { ChromeExtensionDocument, StartExtensionPairingDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";

/**
 * Whether this Chrome has the extension and whether the signed-in user is paired, the server's
 * pairing winning, so a user paired in another Chrome is paired. `startPairing` opens the
 * extension's pair window; the status moves on by itself once the owner pairs there.
 */
export function useChromeExtension() {
  // Pairing and unpairing happen in the extension, outside this cache.
  const query = useQuery(ChromeExtensionDocument, { fetchPolicy: "cache-and-network" });
  const pairing = query.data?.me?.extensionPairing ?? null;
  const isInstalled = useExtensionDetection();
  useRefetchOnFocus(query.refetch);
  // Each "Pair this Chrome" is a new attempt with its own deadline; 0 while none is waiting.
  const [attempt, setAttempt] = useState(0);
  const [start, { loading: isStarting, error: startError }] = usePayloadMutation(
    StartExtensionPairingDocument,
  );
  if (attempt !== 0 && pairing) {
    // Paired: waiting ends here, so unpairing later does not bring it back.
    setAttempt(0);
  }
  usePollWhileAwaitingPair(attempt, query, setAttempt);

  const startPairing = async () => {
    // Opened in the click itself: Chrome blocks a window opened after the click's activation ends.
    const pairWindow = openBlankPairWindow();
    if (!pairWindow) {
      return;
    }
    try {
      const { code } = await start();
      pairWindow.location.replace(pairPageUrl(code));
      setAttempt((current) => current + 1);
    } catch (error) {
      pairWindow.close();
      throw error;
    }
  };

  return {
    status: query.data ? statusOf(pairing !== null, isInstalled) : "checking",
    pairing,
    canPair: isPairableOrigin(window.location.origin),
    startPairing,
    isStarting,
    startFailed: startError !== undefined,
    isAwaitingPair: attempt !== 0,
  };
}

/** How often the page asks whether the extension has paired. */
const PAIR_POLL_INTERVAL_MS = 1_000;

/** The pairing code's lifetime on the server: after it, waiting cannot end in a pairing. */
const PAIRING_CODE_LIFETIME_MS = 5 * 60_000;

/** A file the extension lets every site load, holding nothing, only to tell it is installed. */
// shortcut: any site can load it and so tell the extension is installed; narrow its matches if instances ever share known origins.
const DETECTION_URL = `chrome-extension://${EXTENSION_ID}/installed.txt`;

type ChromeExtensionStatus = "checking" | "not_installed" | "not_paired" | "paired";

function statusOf(isPaired: boolean, isInstalled: boolean | null): ChromeExtensionStatus {
  if (isPaired) {
    return "paired";
  }
  if (isInstalled === null) {
    return "checking";
  }
  return isInstalled ? "not_paired" : "not_installed";
}

/**
 * Whether this Chrome has the extension: checked on load and whenever the page is shown again,
 * such as after installing the extension in another tab.
 */
function useExtensionDetection(): boolean | null {
  const [isInstalled, setInstalled] = useState<boolean | null>(null);
  useEffect(() => {
    let isCurrent = true;
    const detect = () =>
      void isExtensionInstalled().then((found) => isCurrent && setInstalled(found));
    detect();
    window.addEventListener("focus", detect);
    return () => {
      isCurrent = false;
      window.removeEventListener("focus", detect);
    };
  }, []);
  return isInstalled;
}

async function isExtensionInstalled(): Promise<boolean> {
  try {
    return (await fetch(DETECTION_URL)).ok;
  } catch {
    // Without the extension, or outside Chrome, the browser refuses the address.
    return false;
  }
}

/** Reads the pairing again when the page is shown again, such as after the extension's popup. */
function useRefetchOnFocus(refetch: () => Promise<unknown>): void {
  useEffect(() => {
    // A failed read shows as the query's own error.
    const refresh = () => void refetch().catch(() => undefined);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refetch]);
}

/** Polls while pairing `attempt` waits, until its code expires; 0 waits for nothing. */
function usePollWhileAwaitingPair(
  attempt: number,
  {
    startPolling,
    stopPolling,
  }: { startPolling: (interval: number) => void; stopPolling: () => void },
  setAttempt: (attempt: number) => void,
): void {
  useEffect(() => {
    if (attempt === 0) {
      return;
    }
    startPolling(PAIR_POLL_INTERVAL_MS);
    const giveUp = setTimeout(() => setAttempt(0), PAIRING_CODE_LIFETIME_MS);
    return () => {
      stopPolling();
      clearTimeout(giveUp);
    };
  }, [attempt, startPolling, stopPolling, setAttempt]);
}

/** A small empty window for the pair page, cut off from this page, which it gives nothing back. */
function openBlankPairWindow(): Window | null {
  const pairWindow = window.open("about:blank", "_blank", "popup,width=480,height=460");
  if (pairWindow) {
    pairWindow.opener = null;
  }
  return pairWindow;
}

/** The extension's pair page for this instance's origin and `code`; the pairing reaches Settings through the server. */
function pairPageUrl(code: string): string {
  const parameters = new URLSearchParams({ origin: window.location.origin, code });
  return `chrome-extension://${EXTENSION_ID}/pair.html#${parameters.toString()}`;
}
