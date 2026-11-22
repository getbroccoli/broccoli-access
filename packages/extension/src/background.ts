import { hostPermissionOf } from "./instanceOrigin";
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

/** Redeems the instance's one-time code; a pairing with another instance is unpaired first. */
async function pair(origin: string, code: string): Promise<WorkerAnswers["pair"]> {
  const previous = await storedPairing();
  const token = await redeem(origin, code);
  if (token === null) {
    if (previous?.origin !== origin) {
      await chrome.permissions.remove(hostPermissionOf(origin));
    }
    return { paired: false };
  }
  if (previous && previous.origin !== origin) {
    await unpairAt(previous);
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
  try {
    const response = await fetch(`${pairing.origin}/api/extension/pairing`, {
      headers: authorizationOf(pairing),
    });
    if (response.status === UNAUTHORIZED) {
      await forget(pairing);
      return null;
    }
    const { pairedAt } = response.ok ? ((await response.json()) as { pairedAt: string }) : {};
    return { origin: pairing.origin, pairedAt: pairedAt ?? null };
  } catch {
    // Unreachable for now, such as offline: still paired, without the date the instance keeps.
    return { origin: pairing.origin, pairedAt: null };
  }
}

async function unpair(): Promise<null> {
  const pairing = await storedPairing();
  if (pairing) {
    await unpairAt(pairing);
  }
  return null;
}

const UNAUTHORIZED = 401;

async function redeem(origin: string, code: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/api/extension/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, browser: browserLabel() }),
    });
    return response.ok ? ((await response.json()) as { token: string }).token : null;
  } catch {
    // The pair page says pairing failed; the owner starts again from Settings.
    return null;
  }
}

/** Unpairs at the instance when it answers, and forgets the pairing here either way. */
async function unpairAt(pairing: StoredPairing): Promise<void> {
  try {
    await fetch(`${pairing.origin}/api/extension/pairing`, {
      method: "DELETE",
      headers: authorizationOf(pairing),
    });
  } catch {
    // The instance drops the pairing when the owner unpairs in Settings or pairs again.
  }
  await forget(pairing);
}

async function forget(pairing: StoredPairing): Promise<void> {
  await chrome.storage.local.remove(PAIRING_KEY);
  await chrome.permissions.remove(hostPermissionOf(pairing.origin));
}

async function storedPairing(): Promise<StoredPairing | null> {
  const stored = await chrome.storage.local.get<Record<string, StoredPairing>>(PAIRING_KEY);
  return stored[PAIRING_KEY] ?? null;
}

function authorizationOf({ token }: StoredPairing): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

/** What Settings shows for this Chrome, such as "Chrome on macOS". */
function browserLabel(): string {
  const { userAgentData } = navigator as Navigator & { userAgentData?: { platform: string } };
  return userAgentData?.platform ? `Chrome on ${userAgentData.platform}` : "Chrome";
}
