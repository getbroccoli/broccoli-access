import { useEffect, useState } from "react";

/** How long a succeeded change reads "just now". */
const JUST_NOW_MS = 60_000;

/** Whether `finishedAt` was under a minute ago; turns false when the minute passes, even on an idle page. */
export function useJustNow(finishedAt: string | null): boolean {
  const [expired, setExpired] = useState<string | null>(null);
  useEffect(() => {
    if (!finishedAt || msLeft(finishedAt) <= 0) {
      return;
    }
    const timer = setTimeout(() => setExpired(finishedAt), msLeft(finishedAt));
    return () => clearTimeout(timer);
  }, [finishedAt]);
  return finishedAt !== null && expired !== finishedAt && msLeft(finishedAt) > 0;
}

function msLeft(finishedAt: string): number {
  return JUST_NOW_MS - (Date.now() - new Date(finishedAt).getTime());
}
