import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";

import { RunningAccountChangeIdsDocument } from "@/__generated__/graphql";
import { useCache } from "@/apollo";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { forgetAccessCounts } from "./cache";

/** Poll running IDs and coalesce refreshes during a batch. */
export function useRefreshDifferences(
  runningIds: readonly string[],
  refresh: () => Promise<unknown>,
) {
  const cache = useCache();
  const running = useQuery(RunningAccountChangeIdsDocument, {
    skip: runningIds.length === 0,
    fetchPolicy: "network-only",
  });
  usePollWhileScanning(runningIds.length > 0, running);
  const observed = running.data?.runningAccountChangeIds;
  const current = observed && new Set(observed);
  const settled = current && runningIds.some((id) => !current.has(id));
  const stillRunning = Boolean(current?.size);
  useEffect(() => {
    if (!settled) return;
    const timer = window.setTimeout(
      () => {
        forgetAccessCounts(cache);
        void refresh().catch(() => undefined);
      },
      stillRunning ? BATCH_REFRESH_DELAY_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [cache, refresh, settled, stillRunning]);
}

/** Keep detail refreshes sparse while a batch settles one person at a time. */
const BATCH_REFRESH_DELAY_MS = 2500;
