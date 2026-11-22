/** What the extension's pages ask its service worker, which alone holds the pairing's token. */
export type WorkerRequest =
  { type: "pair"; origin: string; code: string } | { type: "readPairing" } | { type: "unpair" };

/** This Chrome's pairing as the popup shows it; `pairedAt` is null while the instance is unreachable. */
export interface PairingView {
  origin: string;
  pairedAt: string | null;
}

/** What the service worker answers each request. */
export interface WorkerAnswers {
  pair: { paired: boolean };
  readPairing: PairingView | null;
  unpair: null;
}

/** Sends `request` to the service worker and waits for its answer. */
export function askWorker<T extends WorkerRequest>(request: T): Promise<WorkerAnswers[T["type"]]> {
  return chrome.runtime.sendMessage(request);
}
