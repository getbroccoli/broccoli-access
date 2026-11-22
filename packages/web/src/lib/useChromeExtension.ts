import { useQuery } from "@apollo/client/react";
import { EXTENSION_ID } from "@broccoli-access/extension";
import { useEffect, useState } from "react";

import { ChromeExtensionDocument, StartExtensionPairingDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";

/** Where the signed-in user's Chrome extension stands; `checking` until this Chrome answers. */
export type ChromeExtensionStatus = "checking" | "not_installed" | "not_paired" | "paired";

/**
 * Whether this Chrome has the extension and whether the signed-in user is paired, the server's
 * pairing winning, so a user paired in another Chrome is paired. `startPairing` opens the
 * extension's pair window; the status moves on by itself once the owner pairs there.
 */
export function useChromeExtension() {
  const query = useQuery(ChromeExtensionDocument);
  const pairing = query.data?.me?.extensionPairing ?? null;
  const isInstalled = useExtensionDetection();
  const [isAwaitingPair, setAwaitingPair] = useState(false);
  const [start, { loading: isStarting, error: startError }] = usePayloadMutation(
    StartExtensionPairingDocument,
  );
  if (isAwaitingPair && pairing) {
    // Paired: waiting ends here, so unpairing later does not bring it back.
    setAwaitingPair(false);
  }
  usePollWhileAwaitingPair(isAwaitingPair, query, setAwaitingPair);

  const startPairing = async () => {
    const { code } = await start();
    openPairWindow(code);
    setAwaitingPair(true);
  };

  return {
    status: statusOf(pairing !== null, isInstalled),
    pairing,
    startPairing,
    isStarting,
    startFailed: startError !== undefined,
    isAwaitingPair,
  };
}

/** How often the page asks whether the extension has paired. */
const PAIR_POLL_INTERVAL_MS = 1_000;

/** The pairing code's lifetime on the server: after it, waiting cannot end in a pairing. */
const PAIRING_CODE_LIFETIME_MS = 5 * 60_000;

/** A file the extension lets every site load, holding nothing, only to tell it is installed. */
const DETECTION_URL = `chrome-extension://${EXTENSION_ID}/installed.txt`;

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

function usePollWhileAwaitingPair(
  isAwaiting: boolean,
  {
    startPolling,
    stopPolling,
  }: { startPolling: (interval: number) => void; stopPolling: () => void },
  setAwaiting: (isAwaiting: boolean) => void,
): void {
  useEffect(() => {
    if (!isAwaiting) {
      return;
    }
    startPolling(PAIR_POLL_INTERVAL_MS);
    const giveUp = setTimeout(() => setAwaiting(false), PAIRING_CODE_LIFETIME_MS);
    return () => {
      stopPolling();
      clearTimeout(giveUp);
    };
  }, [isAwaiting, startPolling, stopPolling, setAwaiting]);
}

/**
 * Opens the extension's pair page in a small window for this instance's origin and `code`. Without
 * an opener, the page gives this one nothing back; the pairing reaches it through the server.
 */
function openPairWindow(code: string): void {
  const parameters = new URLSearchParams({ origin: window.location.origin, code });
  window.open(
    `chrome-extension://${EXTENSION_ID}/pair.html#${parameters.toString()}`,
    "_blank",
    "popup,noopener,width=480,height=460",
  );
}
