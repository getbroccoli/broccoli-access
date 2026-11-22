import { z } from "zod";

/** The fake Google's settings under `pnpm dev`, which sets them in its Compose file. */
export interface Env {
  /** Where browsers reach the consent page, such as `http://localhost:54321`. */
  browserUrl: string;
  /** Where the app's container reaches the fake, such as `http://fake-google:4000`; the fake listens on its port. */
  serverUrl: string;
  /** The seed client's redirect addresses. */
  redirectUris: string[];
}

const httpUrl = z.url({ protocol: /^https?$/ });

const envSchema = z
  .object({
    FAKE_GOOGLE_BROWSER_URL: httpUrl,
    FAKE_GOOGLE_SERVER_URL: httpUrl,
    /** Separated by spaces. */
    FAKE_GOOGLE_REDIRECT_URIS: z
      .string()
      .transform((uris) => uris.split(/\s+/).filter((uri) => uri !== ""))
      .pipe(z.array(httpUrl)),
  })
  .transform((variables): Env => ({
    browserUrl: variables.FAKE_GOOGLE_BROWSER_URL,
    serverUrl: variables.FAKE_GOOGLE_SERVER_URL,
    redirectUris: variables.FAKE_GOOGLE_REDIRECT_URIS,
  }));

/** Reads and validates the environment; throws one error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
