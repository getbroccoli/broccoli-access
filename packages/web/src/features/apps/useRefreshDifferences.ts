import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";

import { RunningAccountChangeCountDocument } from "@/__generated__/graphql";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";

/** Poll just the work still running, then read the affected access again when its count changes. */
export function useRefreshDifferences(runningCount: number, refresh: () => Promise<unknown>) {
  const running = useQuery(RunningAccountChangeCountDocument, {
    skip: runningCount === 0,
    fetchPolicy: "network-only",
  });
  usePollWhileScanning(runningCount > 0, running);
  const observed = running.data?.runningAccountChangeCount;
  useEffect(() => {
    if (runningCount > 0 && observed !== undefined && observed !== runningCount)
      void refresh().catch(() => undefined);
  }, [observed, runningCount, refresh]);
}
