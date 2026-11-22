import { z } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Env {
  databaseUrl: string;
  port: number;
  logLevel: LogLevel;
  /** Folder of the built web app to serve; unset serves only the API. */
  webDir?: string;
  /** The address browsers use (`SELF_HOSTED_PUBLIC_URL`); unset means it is taken from each request. */
  publicUrl?: string;
  /** Folder for files that must survive restarts, such as `secrets/`. */
  dataDir: string;
  /** Where sign-in finds Google's OpenID Connect endpoints. */
  googleOpenIdConfigurationUrl: string;
  /** Where the connector calls Google's Admin APIs. */
  googleAdminApiUrl: string;
}

/** Google's own addresses; only development and tests, with the fake Google, change them. */
const GOOGLE_OPENID_CONFIGURATION_URL =
  "https://accounts.google.com/.well-known/openid-configuration";
const GOOGLE_ADMIN_API_URL = "https://admin.googleapis.com";

/** Compose passes unset variables as empty strings, so blank means unset. */
function blankAsUnset(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const envSchema = z
  .object({
    DATABASE_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^postgres(ql)?$/ })),
    PORT: z.preprocess(blankAsUnset, z.coerce.number().int().min(1).max(65_535).default(3000)),
    LOG_LEVEL: z.preprocess(blankAsUnset, z.enum(LOG_LEVELS).default("info")),
    WEB_DIR: z.preprocess(blankAsUnset, z.string().optional()),
    DATA_DIR: z.preprocess(blankAsUnset, z.string().default("/data")),
    SELF_HOSTED_PUBLIC_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^https?$/ }).optional()),
    GOOGLE_OPENID_CONFIGURATION_URL: z.preprocess(
      blankAsUnset,
      z.url({ protocol: /^https?$/ }).default(GOOGLE_OPENID_CONFIGURATION_URL),
    ),
    GOOGLE_ADMIN_API_URL: z.preprocess(
      blankAsUnset,
      z.url({ protocol: /^https?$/ }).default(GOOGLE_ADMIN_API_URL),
    ),
  })
  .transform((variables): Env => ({
    databaseUrl: variables.DATABASE_URL,
    port: variables.PORT,
    logLevel: variables.LOG_LEVEL,
    webDir: variables.WEB_DIR,
    publicUrl: variables.SELF_HOSTED_PUBLIC_URL,
    dataDir: variables.DATA_DIR,
    googleOpenIdConfigurationUrl: variables.GOOGLE_OPENID_CONFIGURATION_URL,
    googleAdminApiUrl: variables.GOOGLE_ADMIN_API_URL,
  }));

/** Reads and validates the environment; throws one error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** The Google settings that point somewhere other than Google, which a real install never does. */
export function googleSettingsOffGoogle(env: Env): string[] {
  const settings = [
    [
      "GOOGLE_OPENID_CONFIGURATION_URL",
      env.googleOpenIdConfigurationUrl,
      GOOGLE_OPENID_CONFIGURATION_URL,
    ],
    ["GOOGLE_ADMIN_API_URL", env.googleAdminApiUrl, GOOGLE_ADMIN_API_URL],
  ] as const;
  return settings
    .filter(([, url, google]) => new URL(url).origin !== new URL(google).origin)
    .map(([name]) => name);
}
