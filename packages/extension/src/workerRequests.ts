/** What the extension's pages ask its service worker, which alone holds the pairing's token. */
export type WorkerRequest =
  | { type: "pair"; origin: string; code: string }
  | { type: "readPairing" }
  | { type: "checkPairing" }
  | { type: "unpair" };

/** This Chrome's pairing as the popup shows it; `pairedAt` is null while the instance is unreachable. */
export interface PairingView {
  origin: string;
  pairedAt: string | null;
}

/** What the service worker answers each request. */
export interface WorkerAnswers {
  pair: { paired: boolean };
  /** The stored pairing, at once and without its date. */
  readPairing: PairingView | null;
  /** The pairing as the instance knows it; null, and forgotten, when the instance refuses it. */
  checkPairing: PairingView | null;
  /** False when the instance did not confirm, so the pairing stays to try again. */
  unpair: { unpaired: boolean };
}

/** Sends `request` to the service worker and waits for its answer. */
export function askWorker<T extends WorkerRequest>(request: T): Promise<WorkerAnswers[T["type"]]> {
  return chrome.runtime.sendMessage(request);
}
