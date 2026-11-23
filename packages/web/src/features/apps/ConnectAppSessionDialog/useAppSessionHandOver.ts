import { useQuery } from "@apollo/client/react";
import { EXTENSION_ID } from "@broccoli-access/extension";
import { useEffect, useState } from "react";

import { AppSessionHandOverDocument } from "@/__generated__/graphql";

/**
 * Asks the paired extension to hand over the owner's session in `connector`'s app: `start` opens
 * its window, and once that window closes, as the extension closes it after handing over, the
 * session comes back from the server, sealed.
 */
export function useAppSessionHandOver(connector: string) {
  // The hand-over's id stays after its window closes, so its result stays readable.
  const [requestId, setRequestId] = useState<string | null>(null);
  // The extension's window while it waits for the owner; null once it closed.
  const [handOverWindow, setHandOverWindow] = useState<Window | null>(null);
  const [isWindowBlocked, setWindowBlocked] = useState(false);
  // Read once the window has closed: the extension closes it only after the server holds the session.
  const query = useQuery(AppSessionHandOverDocument, {
    variables: { id: requestId ?? "" },
    skip: requestId === null || handOverWindow !== null,
    fetchPolicy: "network-only",
  });
  useCloseDetection(handOverWindow, setHandOverWindow);
  const handOver = requestId ? (query.data?.appSessionHandOver ?? null) : null;
  const hasRead = query.data !== undefined || query.error !== undefined;
  const hasEnded = requestId !== null && handOverWindow === null && hasRead && !handOver;

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
    // The window closed, but reading the hand-over failed.
    readFailed: hasEnded && query.error !== undefined,
    reset: () => {
      setRequestId(null);
      setHandOverWindow(null);
    },
  };
}

/** How often the page checks whether the extension's window has closed. */
const CLOSE_CHECK_INTERVAL_MS = 500;

/**
 * Notices when `handOverWindow` closes, however long the owner takes there; closes it when the
 * dialog goes away first, so nothing is handed over for a request nobody reads.
 */
function useCloseDetection(
  handOverWindow: Window | null,
  setHandOverWindow: (handOverWindow: Window | null) => void,
): void {
  useEffect(() => {
    if (!handOverWindow) {
      return;
    }
    const check = setInterval(() => {
      if (handOverWindow.closed) {
        setHandOverWindow(null);
      }
    }, CLOSE_CHECK_INTERVAL_MS);
    return () => {
      clearInterval(check);
      handOverWindow.close();
    };
  }, [handOverWindow, setHandOverWindow]);
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
