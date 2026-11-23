import { useEffect, useState } from "react";

const COPIED_FEEDBACK_MS = 2000;

/**
 * Copies text to the clipboard and reports "copied" for a moment, or a failure. `copiedAt` changes
 * with every copy, so a second copy restarts the moment and can be announced again.
 */
export function useCopyToClipboard() {
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (copiedAt === null) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedAt(null), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copiedAt]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setCopiedAt(Date.now());
    } catch {
      setCopiedAt(null);
      setCopyFailed(true);
    }
  }

  return { copied: copiedAt !== null, copiedAt, copyFailed, copy };
}
