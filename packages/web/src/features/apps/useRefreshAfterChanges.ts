import { useCache } from "@/apollo";
import { useRefetchAfterScan } from "@/lib/useRefetchAfterScan";

import { forgetAccessCounts } from "./cache";

/**
 * Reads the page once more when the account changes it saw running end, whichever rows show, and
 * drops the counts they change elsewhere: the last poll can read a row just before its change ends.
 */
export function useRefreshAfterChanges(isChanging: boolean, refetch: () => Promise<unknown>): void {
  const cache = useCache();
  useRefetchAfterScan(isChanging, () => {
    forgetAccessCounts(cache);
    return refetch();
  });
}
