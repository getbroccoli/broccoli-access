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
  // The pair window while it waits for the owner; null once they paired, cancelled or ran out of time.
  const [pairWindow, setPairWindow] = useState<Window | null>(null);
  const [isWindowBlocked, setWindowBlocked] = useState(false);
  const [start, { loading: isStarting, error: startError }] = usePayloadMutation(
    StartExtensionPairingDocument,
  );
  if (pairWindow && pairing) {
    // Paired: waiting ends here, so unpairing later does not bring it back.
    setPairWindow(null);
  }
  usePollWhilePairWindowOpen(pairWindow, query.refetch, setPairWindow);

  const startPairing = async () => {
    // Opened in the click itself: Chrome blocks a window opened after the click's activation ends.
    const opened = openBlankPairWindow();
    setWindowBlocked(opened === null);
    if (!opened) {
      return;
    }
    try {
      const { code } = await start();
      opened.location.replace(pairPageUrl(code));
      setPairWindow(opened);
    } catch (error) {
      opened.close();
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
    isWindowBlocked,
    isAwaitingPair: pairWindow !== null,
    // A read on its way could answer from before an unpair and show the pairing again.
    isReading: query.loading,
    loadFailed: query.error !== undefined && !query.data,
    retry: () => void query.refetch().catch(() => undefined),
  };
}

/** Where the owner installs the extension. */
export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID}`;

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

/**
 * Asks for the pairing every second while `pairWindow` is open, and once more when it closes, as
 * it does after Pair or Cancel; gives up when the code has expired.
 */
function usePollWhilePairWindowOpen(
  pairWindow: Window | null,
  refetch: () => Promise<unknown>,
  setPairWindow: (pairWindow: Window | null) => void,
): void {
  useEffect(() => {
    if (!pairWindow) {
      return;
    }
    const poll = setInterval(() => {
      void refetch().catch(() => undefined);
      if (pairWindow.closed) {
        setPairWindow(null);
      }
    }, PAIR_POLL_INTERVAL_MS);
    const giveUp = setTimeout(() => setPairWindow(null), PAIRING_CODE_LIFETIME_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [pairWindow, refetch, setPairWindow]);
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
