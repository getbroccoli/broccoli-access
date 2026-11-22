import { APP_SESSION_PERMISSIONS, hostPatternsOf } from "./appSession";
import { parseInstanceOrigin, shownOrigin } from "./instanceOrigin";
import { element, showState, showVersion } from "./page";
import { askWorker, type AppSessionRequest, type HandOverOutcome } from "./workerRequests";

/**
 * The window Connect opens, with `#origin=<instance origin>&connector=<key>&request=<id>`. It asks
 * the owner to hand over their app session to the paired instance, which says what to collect,
 * and gives the page that opened it nothing back: the page reads the result from the instance.
 */
// A framed page could have a site's own button sit over Hand over; the CSP refuses frames too.
if (window.top === window) {
  void start();
}

async function start(): Promise<void> {
  const parameters = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname);
  const origin = parseInstanceOrigin(parameters.get("origin"));
  const connector = parameters.get("connector");
  const requestId = parameters.get("request");
  showVersion();
  element("main").hidden = false;
  if (origin === null || !connector || !requestId) {
    showState("broken");
    return;
  }
  // Only the paired instance may ask, and the extension calls only that one.
  if ((await askWorker({ type: "readPairing" }))?.origin !== origin) {
    showState("not-paired");
    return;
  }
  const request = await askWorker({ type: "describeAppSession", connector });
  if (!request) {
    showState("broken");
    return;
  }
  showRequest(origin, request);
  element("[data-cancel]").addEventListener("click", () => window.close());
  element("[data-hand-over]").addEventListener("click", () => void handOver(request, requestId));
  showState("ask");
}

function showRequest(origin: string, request: AppSessionRequest): void {
  for (const app of document.querySelectorAll("[data-app]")) {
    app.textContent = request.name;
  }
  element("[data-origin]").textContent = shownOrigin(origin);
  element("[data-storage]").hidden = request.storageKeys.length === 0;
  element("[data-domains]").replaceChildren(
    ...request.domains.map((domain) => {
      const item = document.createElement("li");
      item.textContent = domain;
      return item;
    }),
  );
}

async function handOver(request: AppSessionRequest, requestId: string): Promise<void> {
  const buttons = document.querySelectorAll<HTMLButtonElement>("button");
  setDisabled(buttons, true);
  // Chrome asks the owner in its own prompt, which needs this click; nothing may await before it.
  const granted = await chrome.permissions
    .request({ permissions: APP_SESSION_PERMISSIONS, origins: hostPatternsOf(request.domains) })
    // Chrome refuses to ask for what the manifest does not allow, such as another scheme.
    .catch(() => false);
  if (!granted) {
    showFailure(`Chrome has no access to ${request.name}, so nothing was handed over.`);
    setDisabled(buttons, false);
    return;
  }
  const { outcome } = await askWorker({
    type: "handOverAppSession",
    connector: request.connector,
    requestId,
  });
  if (outcome === "handed_over") {
    window.close();
    return;
  }
  showFailure(failureMessage(outcome, request.name));
  setDisabled(buttons, false);
}

function failureMessage(outcome: Exclude<HandOverOutcome, "handed_over">, app: string): string {
  switch (outcome) {
    case "signed_out":
      return `Open ${app} in a tab of this Chrome and sign in, then hand over again.`;
    case "refused":
      return `${app} didn't accept this session. Sign in to ${app} again, then hand over again.`;
    case "failed":
      return "Handing over failed. Start again from Settings in Broccoli Access.";
  }
}

function setDisabled(buttons: Iterable<HTMLButtonElement>, disabled: boolean): void {
  for (const button of buttons) {
    button.disabled = disabled;
  }
}

function showFailure(message: string): void {
  const failure = element("[data-failure]");
  failure.textContent = message;
  failure.hidden = false;
}
