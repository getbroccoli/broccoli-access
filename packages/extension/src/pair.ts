import { hostPermissionOf, parseInstanceOrigin, shownOrigin } from "./instanceOrigin";
import { element, showState, showVersion } from "./page";
import { askWorker } from "./workerRequests";

/**
 * The window "Pair this Chrome" opens, with `#origin=<instance origin>&code=<one-time code>`. It
 * asks the owner to pair with exactly that origin, and gives the page that opened it nothing back.
 */
// A framed page could have a site's own button sit over Pair; the CSP refuses frames too.
if (window.top === window) {
  start();
}

function start(): void {
  const parameters = new URLSearchParams(location.hash.slice(1));
  const origin = parseInstanceOrigin(parameters.get("origin"));
  const code = parameters.get("code");
  showVersion();
  element("main").hidden = false;
  if (origin === null || !code) {
    showState("broken");
    return;
  }
  element("[data-origin]").textContent = shownOrigin(origin);
  element("[data-cancel]").addEventListener("click", () => window.close());
  element("[data-pair]").addEventListener("click", () => void pair(origin, code));
  showState("ask");
}

async function pair(origin: string, code: string): Promise<void> {
  const pairButton = element<HTMLButtonElement>("[data-pair]");
  pairButton.disabled = true;
  // Chrome asks the owner in its own prompt, which needs this click; nothing may await before it.
  const granted = await chrome.permissions.request(hostPermissionOf(origin));
  if (!granted) {
    showFailure(
      "Chrome has no access to this address, so nothing changed. Pair again to allow it.",
    );
    pairButton.disabled = false;
    return;
  }
  const { paired } = await askWorker({ type: "pair", origin, code });
  if (!paired) {
    showFailure("Pairing failed. Start again from Settings in Broccoli Access.");
    return;
  }
  window.close();
}

function showFailure(message: string): void {
  const failure = element("[data-failure]");
  failure.textContent = message;
  failure.hidden = false;
}
