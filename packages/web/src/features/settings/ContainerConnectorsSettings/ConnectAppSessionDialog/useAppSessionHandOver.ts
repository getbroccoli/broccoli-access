import { useQuery } from "@apollo/client/react";
import { EXTENSION_ID } from "@broccoli-access/extension";
import { useEffect, useState } from "react";

import { AppSessionHandOverDocument } from "@/__generated__/graphql";

/**
 * Asks the paired extension to hand over the owner's session in `connector`'s app: `start` opens
 * its window, and the session comes back from the server, sealed, once the owner confirms there.
 */
export function useAppSessionHandOver(connector: string) {
  // The hand-over's id stays after its window closes, so its result stays readable.
  const [requestId, setRequestId] = useState<string | null>(null);
  // The extension's window while it waits for the owner; null once it closed or timed out.
  const [handOverWindow, setHandOverWindow] = useState<Window | null>(null);
  const [isWindowBlocked, setWindowBlocked] = useState(false);
  const query = useQuery(AppSessionHandOverDocument, {
    variables: { id: requestId ?? "" },
    skip: requestId === null,
    fetchPolicy: "network-only",
  });
  const handOver = requestId ? (query.data?.appSessionHandOver ?? null) : null;
  if (handOverWindow && handOver) {
    // Handed over: waiting ends here.
    setHandOverWindow(null);
  }
  usePollWhileWindowOpen(handOverWindow, query.refetch, setHandOverWindow);
  const hasEnded = requestId !== null && handOverWindow === null && !handOver && !query.loading;

  const start = () => {
    // Opened in the click itself: Chrome blocks a window opened after the click's activation ends.
    const opened = window.open("about:blank", "_blank", "popup,width=480,height=560");
    setWindowBlocked(opened === null);
    if (!opened) {
      return;
    }
    opened.opener = null;
    const id = crypto.randomUUID();
    opened.location.replace(handOverPageUrl(connector, id));
    setRequestId(id);
    setHandOverWindow(opened);
  };

  return {
    start,
    handOver,
    isAwaiting: handOverWindow !== null,
    isWindowBlocked,
    // The window closed without a session, such as after Cancel.
    wasAbandoned: hasEnded && query.error === undefined,
    // The window closed, but the last read of the hand-over failed.
    readFailed: hasEnded && query.error !== undefined,
    reset: () => {
      setRequestId(null);
      setHandOverWindow(null);
    },
  };
}

/** How often the page asks whether the extension has handed the session over. */
const POLL_INTERVAL_MS = 1_000;

/**
 * Asks for the hand-over every second while `handOverWindow` is open, however long the owner takes
 * there, and once more when it closes, as it does after the hand-over or Cancel.
 */
function usePollWhileWindowOpen(
  handOverWindow: Window | null,
  refetch: () => Promise<unknown>,
  setHandOverWindow: (handOverWindow: Window | null) => void,
): void {
  useEffect(() => {
    if (!handOverWindow) {
      return;
    }
    const poll = setInterval(() => {
      if (!handOverWindow.closed) {
        void refetch().catch(() => undefined);
        return;
      }
      clearInterval(poll);
      // The extension closes its window once the server holds the session, so this read finds it.
      void refetch()
        .catch(() => undefined)
        .finally(() => setHandOverWindow(null));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [handOverWindow, refetch, setHandOverWindow]);
}

/** The extension's hand-over page for this instance, the connector and the hand-over's id. */
function handOverPageUrl(connector: string, requestId: string): string {
  const parameters = new URLSearchParams({
    origin: window.location.origin,
    connector,
    request: requestId,
  });
  return `chrome-extension://${EXTENSION_ID}/handOver.html#${parameters.toString()}`;
}
