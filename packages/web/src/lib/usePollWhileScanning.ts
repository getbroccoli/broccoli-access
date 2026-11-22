import { useEffect } from "react";

/** How often a page asks for a scan's outcome while it runs. */
const SCAN_POLL_INTERVAL_MS = 1_000;

type PolledQuery = {
  startPolling: (interval: number) => void;
  stopPolling: () => void;
};

/** Polls the query while a scan runs, so the page shows the scan's outcome once it finishes. */
export function usePollWhileScanning(
  isScanning: boolean,
  { startPolling, stopPolling }: PolledQuery,
) {
  useEffect(() => {
    if (!isScanning) {
      return;
    }
    startPolling(SCAN_POLL_INTERVAL_MS);
    return stopPolling;
  }, [isScanning, startPolling, stopPolling]);
}
