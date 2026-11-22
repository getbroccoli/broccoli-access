import { shownOrigin } from "./instanceOrigin";
import { element, showState, showVersion } from "./page";
import { askWorker, type PairingView } from "./workerRequests";

showVersion();
element("[data-unpair]").addEventListener("click", () => void unpair());
void askWorker({ type: "readPairing" }).then(showPairing);

/** Like the instance's own dates: "1 Dec 2026". */
const PAIRED_AT_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function showPairing(pairing: PairingView | null): void {
  if (!pairing) {
    showState("not-paired");
    return;
  }
  element("[data-origin]").textContent = shownOrigin(pairing.origin);
  element<HTMLAnchorElement>("[data-open]").href = pairing.origin;
  for (const since of document.querySelectorAll<HTMLElement>("[data-since]")) {
    since.hidden = pairing.pairedAt === null;
  }
  if (pairing.pairedAt !== null) {
    element("[data-paired-at]").textContent = PAIRED_AT_FORMAT.format(new Date(pairing.pairedAt));
  }
  showState("paired");
}

async function unpair(): Promise<void> {
  const unpairButton = element<HTMLButtonElement>("[data-unpair]");
  unpairButton.disabled = true;
  const { unpaired } = await askWorker({ type: "unpair" });
  unpairButton.disabled = false;
  element("[data-unpair-failed]").hidden = unpaired;
  if (unpaired) {
    showState("not-paired");
  }
}
