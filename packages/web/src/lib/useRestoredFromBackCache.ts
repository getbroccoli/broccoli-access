import { useEffect } from "react";

/**
 * Runs `onRestored` when the browser shows this page again from its back-forward cache, as it was
 * left: a page that sent the person away, such as to Google's consent, stops waiting then.
 */
export function useRestoredFromBackCache(onRestored: () => void): void {
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        onRestored();
      }
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, [onRestored]);
}
