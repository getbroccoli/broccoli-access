/** What the extension's pages ask its service worker, which alone holds the pairing's token. */
export type WorkerRequest =
  | { type: "pair"; origin: string; code: string }
  | { type: "readPairing" }
  | { type: "checkPairing" }
  | { type: "unpair" }
  | { type: "describeAppSession"; connector: string }
  | { type: "handOverAppSession"; connector: string; requestId: string };

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
  /** What the paired instance asks for; null when unpaired or the instance refuses. */
  describeAppSession: AppSessionRequest | null;
  handOverAppSession: { outcome: HandOverOutcome };
}

/** What the paired instance asks the extension to collect for a connector's app session. */
export interface AppSessionRequest {
  connector: string;
  /** The app's name, such as "Slack". */
  name: string;
  /** Whose cookies it collects: these domains and their subdomains. */
  domains: string[];
  /** The local storage keys of the app's signed-in page whose values it collects. */
  storageKeys: string[];
}

/**
 * How a hand-over ended: `signed_out` when no open tab of the app keeps its session, `refused`
 * when the instance or the app refused it.
 */
export type HandOverOutcome = "handed_over" | "signed_out" | "refused" | "failed";

/** Sends `request` to the service worker and waits for its answer. */
export function askWorker<T extends WorkerRequest>(request: T): Promise<WorkerAnswers[T["type"]]> {
  return chrome.runtime.sendMessage(request);
}
