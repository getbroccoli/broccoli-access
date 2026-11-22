/** The page's one element matching `selector`; the markup always has it. */
export function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

/** Shows `state`'s section of the card and hides the others. */
export function showState(state: string): void {
  for (const section of document.querySelectorAll<HTMLElement>("[data-state]")) {
    section.hidden = section.dataset.state !== state;
  }
}

/** Puts the extension's version in the card's header, as Chrome reads it from the manifest. */
export function showVersion(): void {
  element("[data-version]").textContent = chrome.runtime.getManifest().version;
}
