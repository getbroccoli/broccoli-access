import { invalidInput } from "../../../core/applicationError";

/** A user's Chrome, paired with this instance. */
export interface ExtensionPairing {
  id: string;
  userId: string;
  /** As the extension reported it, such as "Chrome on macOS". */
  browser: string;
  pairedAt: Date;
  /** When the extension last called the instance with its token. */
  lastSeenAt: Date;
}

/** The browser label the extension reports, trimmed; refused when blank or too long to show. */
export function parseBrowserLabel(raw: string): string {
  const browser = raw.trim();
  if (browser === "" || browser.length > MAX_BROWSER_LENGTH) {
    throw invalidInput([{ field: "browser", code: "invalid" }]);
  }
  return browser;
}

/** Far beyond "Chrome on Chrome OS"; keeps a label to one line in Settings. */
const MAX_BROWSER_LENGTH = 100;
