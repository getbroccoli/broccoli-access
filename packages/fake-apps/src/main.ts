import { z } from "zod";

import { startFakeGoogle } from "./google";

/**
 * Runs the fake Google for `pnpm dev` in its own container: the app's container reaches it at
 * the server address, the host's browser at the browser address. A restart resets it to the seed.
 */
const SETTINGS = z.object({
  /** Where browsers reach the consent page, such as `http://localhost:54321`. */
  FAKE_GOOGLE_BROWSER_URL: z.url({ protocol: /^https?$/ }),
  /** Where the app's container reaches the fake, such as `http://fake-google:4000`; the fake listens on its port. */
  FAKE_GOOGLE_SERVER_URL: z.url({ protocol: /^https?$/ }),
  /** The seed client's redirect addresses, separated by spaces. */
  FAKE_GOOGLE_REDIRECT_URIS: z
    .string()
    .transform((uris) => uris.split(/\s+/).filter((uri) => uri !== ""))
    .pipe(z.array(z.url({ protocol: /^https?$/ }))),
});

const settings = SETTINGS.parse(process.env);
await startFakeGoogle({
  // Every interface of its own container; Compose publishes the port on the host's localhost only.
  host: "0.0.0.0",
  port: Number(new URL(settings.FAKE_GOOGLE_SERVER_URL).port),
  browserUrl: settings.FAKE_GOOGLE_BROWSER_URL,
  serverUrl: settings.FAKE_GOOGLE_SERVER_URL,
  redirectUris: settings.FAKE_GOOGLE_REDIRECT_URIS,
});
