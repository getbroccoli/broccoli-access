import { useEffect, useRef } from "react";

/**
 * Calls `refetch` once a scan the component saw running ends, wherever it was started: a scan
 * changes what the server computes, such as who is suspended with access.
 */
export function useRefetchAfterScan(isScanning: boolean, refetch: () => Promise<unknown>): void {
  const sawScanning = useRef(false);
  useEffect(() => {
    if (isScanning) {
      sawScanning.current = true;
      return;
    }
    if (sawScanning.current) {
      sawScanning.current = false;
      void refetch();
    }
  }, [isScanning, refetch]);
}
