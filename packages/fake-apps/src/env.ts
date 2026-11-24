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

/** The fake connectors container's settings under `pnpm dev`. */
export interface ConnectorsEnv {
  /** Where it reaches the fake Google, such as `http://fake-google:4000`; without it, no integration user can be set up. */
  googleUrl?: string;
}

const connectorsEnvSchema = z
  .object({ FAKE_GOOGLE_URL: httpUrl.optional() })
  .transform((variables): ConnectorsEnv => ({ googleUrl: variables.FAKE_GOOGLE_URL }));

export function loadConnectorsEnv(source: NodeJS.ProcessEnv = process.env): ConnectorsEnv {
  return parsed(connectorsEnvSchema, source);
}

/** Reads and validates the environment; throws one error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parsed(envSchema, source);
}

function parsed<T>(schema: z.ZodType<T, unknown>, source: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
