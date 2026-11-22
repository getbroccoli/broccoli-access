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

const CREATED = 201;

const UNAUTHORIZED = 401;

/** The paired instance and the token it gave, shown to the extension once. */
interface StoredPairing {
  origin: string;
  token: string;
}

function answer(request: WorkerRequest): Promise<WorkerAnswers[WorkerRequest["type"]]> {
  switch (request.type) {
    case "pair":
      return pair(request.origin, request.code);
    case "readPairing":
      return readPairing();
    case "unpair":
      return unpair();
  }
}

/** Redeems the instance's one-time code; a pairing with another instance is dropped first. */
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
  if (previous && previous.origin !== origin) {
    // The owner chose another instance: its pairing goes here even when the old one does not answer.
    await callInstance(previous, "DELETE");
    await forgetIfCurrent(previous);
  }
  await chrome.storage.local.set({ [PAIRING_KEY]: { origin, token } satisfies StoredPairing });
  return { paired: true };
}

/** The pairing as the instance knows it; one the instance refuses is forgotten here too. */
async function readPairing(): Promise<PairingView | null> {
  const pairing = await storedPairing();
  if (!pairing) {
    return null;
  }
  const response = await callInstance(pairing, "GET");
  if (response?.status === UNAUTHORIZED) {
    await forgetIfCurrent(pairing);
    return null;
  }
  // Unreachable for now, such as offline: still paired, without the date the instance keeps.
  const pairedAt = response?.ok
    ? ((await response.json()) as { pairedAt?: unknown }).pairedAt
    : null;
  return { origin: pairing.origin, pairedAt: typeof pairedAt === "string" ? pairedAt : null };
}

/** Unpairs at the instance, and here once the instance confirms, so a failed unpair can be retried. */
async function unpair(): Promise<WorkerAnswers["unpair"]> {
  const pairing = await storedPairing();
  if (!pairing) {
    return { unpaired: true };
  }
  const response = await callInstance(pairing, "DELETE");
  // 401: the instance had already dropped this pairing.
  const isGone = response !== null && (response.ok || response.status === UNAUTHORIZED);
  if (isGone) {
    await forgetIfCurrent(pairing);
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

/** The instance's answer to a call with the pairing's token; null when it did not answer in time. */
async function callInstance(
  pairing: StoredPairing,
  method: "GET" | "DELETE",
): Promise<Response | null> {
  try {
    return await fetch(`${pairing.origin}/api/extension/pairing`, {
      method,
      headers: { authorization: `Bearer ${pairing.token}` },
      signal: AbortSignal.timeout(INSTANCE_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
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
