import { describeAppSession, handOverAppSession } from "./appSessionHandOver";
import { callInstance, type StoredPairing } from "./instanceCall";
import { hostPermissionOf, isPairableOrigin } from "./instanceOrigin";
import type { PairingView, WorkerAnswers, WorkerRequest } from "./workerRequests";

/**
 * The service worker: the one place that holds the pairing's token and calls the instance with it.
 * One instance per Chrome; pairing with another replaces it.
 */
chrome.runtime.onMessage.addListener((request: WorkerRequest, sender, sendResponse) => {
  // Only the extension's own pages reach it: no site can, as nothing is externally connectable.
  if (sender.id !== chrome.runtime.id) {
    return false;
  }
  void answer(request).then(sendResponse);
  // Keeps the channel open for the asynchronous answer.
  return true;
});

/** Where `chrome.storage.local` keeps the pairing. */
const PAIRING_KEY = "pairing";

/** How long a call to the instance may take before the extension stops waiting for it. */
const INSTANCE_TIMEOUT_MS = 10_000;

/** Where the extension reads and unpairs its pairing. */
const PAIRING_PATH = "/api/extension/pairing";

const CREATED = 201;

const UNAUTHORIZED = 401;

/** The last change to the stored pairing; each change waits for it, so none undoes another. */
let pairingChanges: Promise<unknown> = Promise.resolve();

function answer(request: WorkerRequest): Promise<WorkerAnswers[WorkerRequest["type"]]> {
  switch (request.type) {
    case "pair":
      return changePairing(() => pair(request.origin, request.code));
    case "readPairing":
      return storedPairing().then(
        (pairing) => pairing && { origin: pairing.origin, pairedAt: null },
      );
    case "checkPairing":
      return checkPairing();
    case "unpair":
      return unpair();
    case "describeAppSession":
      return storedPairing().then(
        (pairing) => pairing && describeAppSession(pairing, request.connector),
      );
    case "handOverAppSession":
      return storedPairing().then(async (pairing) => ({
        outcome: pairing ? await handOverAppSession(pairing, request) : "failed",
      }));
  }
}

/** Runs `change` after every earlier change to the stored pairing has ended. */
function changePairing<T>(change: () => Promise<T>): Promise<T> {
  const result = pairingChanges.then(change);
  pairingChanges = result.catch(() => undefined);
  return result;
}

/** Redeems the instance's one-time code; a pairing with another instance is retired afterwards. */
async function pair(origin: string, code: string): Promise<WorkerAnswers["pair"]> {
  // The pair page checks it too; the token must never travel to another origin.
  if (!isPairableOrigin(origin)) {
    return { paired: false };
  }
  const previous = await storedPairing();
  const token = await redeem(origin, code);
  if (token === null) {
    if (previous?.origin !== origin) {
      await chrome.permissions.remove(hostPermissionOf(origin));
    }
    return { paired: false };
  }
  await chrome.storage.local.set({ [PAIRING_KEY]: { origin, token } satisfies StoredPairing });
  if (previous && previous.origin !== origin) {
    // Not awaited: the new pairing holds even when the old instance does not answer.
    void retire(previous);
  }
  return { paired: true };
}

/** The pairing as the instance knows it; one the instance refuses is forgotten here too. */
async function checkPairing(): Promise<PairingView | null> {
  const pairing = await storedPairing();
  if (!pairing) {
    return null;
  }
  const response = await callInstance(pairing, PAIRING_PATH, { method: "GET" });
  if (response?.status === UNAUTHORIZED) {
    await changePairing(() => forgetIfCurrent(pairing));
    return null;
  }
  // Unreachable for now, such as offline: still paired, without the date the instance keeps.
  const body: unknown = response?.ok ? await response.json().catch(() => null) : null;
  const pairedAt = (body as { pairedAt?: unknown } | null)?.pairedAt;
  return { origin: pairing.origin, pairedAt: typeof pairedAt === "string" ? pairedAt : null };
}

/** Unpairs at the instance, and here once the instance confirms, so a failed unpair can be retried. */
async function unpair(): Promise<WorkerAnswers["unpair"]> {
  const pairing = await storedPairing();
  if (!pairing) {
    return { unpaired: true };
  }
  const response = await callInstance(pairing, PAIRING_PATH, { method: "DELETE" });
  // 401: the instance had already dropped this pairing.
  const isGone = response !== null && (response.ok || response.status === UNAUTHORIZED);
  if (isGone) {
    await changePairing(() => forgetIfCurrent(pairing));
  }
  return { unpaired: isGone };
}

async function redeem(origin: string, code: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/api/extension/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, browser: browserLabel() }),
      signal: AbortSignal.timeout(INSTANCE_TIMEOUT_MS),
    });
    if (response.status !== CREATED) {
      return null;
    }
    const { token } = (await response.json()) as { token?: unknown };
    return typeof token === "string" && token !== "" ? token : null;
  } catch {
    // The pair page says pairing failed; the owner starts again from Settings.
    return null;
  }
}

/** Unpairs a replaced instance, then drops its host access unless the current pairing needs it. */
async function retire(previous: StoredPairing): Promise<void> {
  await callInstance(previous, PAIRING_PATH, { method: "DELETE" });
  await changePairing(async () => {
    if ((await storedPairing())?.origin !== previous.origin) {
      await chrome.permissions.remove(hostPermissionOf(previous.origin));
    }
  });
}

/** Forgets `pairing` unless pairing again replaced it meanwhile, such as while a call was on its way. */
async function forgetIfCurrent(pairing: StoredPairing): Promise<void> {
  const current = await storedPairing();
  if (current?.token !== pairing.token) {
    return;
  }
  await chrome.storage.local.remove(PAIRING_KEY);
  await chrome.permissions.remove(hostPermissionOf(pairing.origin));
}

async function storedPairing(): Promise<StoredPairing | null> {
  const stored = await chrome.storage.local.get<Record<string, StoredPairing>>(PAIRING_KEY);
  return stored[PAIRING_KEY] ?? null;
}

/** What Settings shows for this Chrome, such as "Chrome on macOS". */
function browserLabel(): string {
  const { userAgentData } = navigator as Navigator & { userAgentData?: { platform: string } };
  return userAgentData?.platform ? `Chrome on ${userAgentData.platform}` : "Chrome";
}
