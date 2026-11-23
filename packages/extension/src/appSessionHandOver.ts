import {
  APP_SESSION_PERMISSIONS,
  appSessionCookiesOf,
  appSessionStorageOf,
  hostPatternsOf,
} from "./appSession";
import { callInstance, type StoredPairing } from "./instanceCall";
import type { AppSessionRequest, HandOverOutcome } from "./workerRequests";

/** What the paired instance asks the extension to collect for `connector`; null when it refuses. */
export async function describeAppSession(
  pairing: StoredPairing,
  connector: string,
): Promise<AppSessionRequest | null> {
  const response = await callInstance(pairing, appSessionPath(connector), {
    method: "GET",
  });
  if (!response?.ok) {
    return null;
  }
  return parseAppSessionRequest(await response.json().catch(() => null));
}

/**
 * Collects the app session the paired instance describes, never what a page names, and sends it
 * to the instance for its page's `requestId`: only those cookies and storage values leave Chrome,
 * and the extension keeps none of them.
 */
export async function handOverAppSession(
  pairing: StoredPairing,
  {
    origin,
    confirmed,
    requestId,
  }: { origin: string; confirmed: AppSessionRequest; requestId: string },
): Promise<HandOverOutcome> {
  // Pairing again, or a changed manifest, after the owner confirmed: they confirmed something else.
  const request =
    pairing.origin === origin ? await describeAppSession(pairing, confirmed.connector) : null;
  if (!request || !isSameRequest(request, confirmed) || !(await hasAccessTo(request.domains))) {
    return "failed";
  }
  const storage = await storageOfOpenTab(request);
  if (storage === null) {
    return "signed_out";
  }
  const cookies = appSessionCookiesOf(await cookiesOf(request.domains), request.domains);
  const response = await callInstance(pairing, appSessionPath(request.connector), {
    method: "POST",
    body: { requestId, appSession: { cookies, storage } },
    timeoutMs: HAND_OVER_TIMEOUT_MS,
  });
  if (response?.status === NO_CONTENT) {
    return "handed_over";
  }
  return response?.status === BAD_REQUEST ? "refused" : "failed";
}

/**
 * How long the worker waits for the instance to test the session: under the 30 seconds after
 * which Chrome stops a service worker waiting on a fetch, so the owner hears how it ended.
 */
const HAND_OVER_TIMEOUT_MS = 25_000;

const NO_CONTENT = 204;

const BAD_REQUEST = 400;

function appSessionPath(connector: string): string {
  return `/api/extension/app-sessions/${encodeURIComponent(connector)}`;
}

function isSameRequest(request: AppSessionRequest, confirmed: AppSessionRequest): boolean {
  return JSON.stringify(request) === JSON.stringify(confirmed);
}

function parseAppSessionRequest(body: unknown): AppSessionRequest | null {
  const { connector, name, domains, storageKeys } = (body ?? {}) as Record<string, unknown>;
  const isRequest =
    typeof connector === "string" &&
    typeof name === "string" &&
    isStringList(domains) &&
    domains.length > 0 &&
    isStringList(storageKeys);
  return isRequest ? { connector, name, domains, storageKeys } : null;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Whether the owner gave Chrome's access to the app's domains, which the hand-over page asks for. */
function hasAccessTo(domains: readonly string[]): Promise<boolean> {
  return chrome.permissions.contains({
    permissions: APP_SESSION_PERMISSIONS,
    origins: hostPatternsOf(domains),
  });
}

async function cookiesOf(domains: readonly string[]): Promise<chrome.cookies.Cookie[]> {
  const perDomain = await Promise.all(domains.map((domain) => chrome.cookies.getAll({ domain })));
  return perDomain.flat();
}

/**
 * The named storage values from the first open tab of the app's domains whose page keeps all of
 * them; null when no such tab is open, so the owner opens the app and signs in.
 */
async function storageOfOpenTab(
  request: AppSessionRequest,
): Promise<Record<string, string> | null> {
  if (request.storageKeys.length === 0) {
    return {};
  }
  const tabs = await chrome.tabs.query({ url: hostPatternsOf(request.domains) });
  // An incognito tab keeps its own cookies, which the worker does not read.
  for (const { id } of tabs.filter(({ incognito }) => !incognito)) {
    const storage = id === undefined ? null : await storageOfTab(id, request);
    if (storage) {
      return storage;
    }
  }
  return null;
}

async function storageOfTab(
  tabId: number,
  { storageKeys, domains }: AppSessionRequest,
): Promise<Record<string, string> | null> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readLocalStorage,
      args: [[...storageKeys], [...domains]],
    });
    return appSessionStorageOf(injection?.result ?? {}, storageKeys);
  } catch {
    // A tab Chrome does not let it script, such as one still loading an error page.
    return null;
  }
}

/**
 * Runs in the app's tab, so it reads only the keys it is given, and nothing else of the page; it
 * reads nothing once the tab has moved to a host outside the app's domains. Chrome runs it on its
 * own, so it repeats the domain check instead of importing it.
 */
function readLocalStorage(keys: string[], domains: string[]): Record<string, string | null> {
  const host = location.hostname;
  if (!domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return {};
  }
  return Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
}
