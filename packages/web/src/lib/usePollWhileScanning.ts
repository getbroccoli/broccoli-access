import { useEffect, useRef } from "react";

/** How often a page asks for a scan's outcome while it runs. */
const SCAN_POLL_INTERVAL_MS = 1_000;

type PolledQuery = {
  startPolling: (interval: number) => void;
  stopPolling: () => void;
};

/**
 * Polls the query while a scan runs, so the page shows the scan's outcome once it finishes; calls
 * `onEnd` once each time a scan it saw running ends.
 */
export function usePollWhileScanning(
  isScanning: boolean,
  { startPolling, stopPolling }: PolledQuery,
  onEnd?: () => unknown,
) {
  const wasScanning = useRef(false);
  useEffect(() => {
    if (wasScanning.current && !isScanning) {
      void onEnd?.();
    }
    wasScanning.current = isScanning;
  }, [isScanning, onEnd]);
  useEffect(() => {
    if (!isScanning) {
      return;
    }
    startPolling(SCAN_POLL_INTERVAL_MS);
    return stopPolling;
  }, [isScanning, startPolling, stopPolling]);
}
