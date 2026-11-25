import { useEffect, useEffectEvent } from "react";

/** How often the list is read while a change runs: a change takes a few seconds. */
const CHANGE_POLL_INTERVAL_MS = 1_000;

// shortcut: reads the whole loaded list each second while a change runs; read only the running
// rows once that list is long enough to matter.
/** Reads the list again and again while one of its rows' changes runs, so the row shows how it ended. */
export function useRefreshWhileChanging(isChanging: boolean, refresh: () => Promise<unknown>) {
  const read = useEffectEvent(() => void refresh());
  useEffect(() => {
    if (!isChanging) {
      return;
    }
    const timer = setInterval(read, CHANGE_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isChanging]);
}
