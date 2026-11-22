import { loadEnv } from "./env";
import { startFakeGoogle } from "./google";

// Runs the fake Google for `pnpm dev` in its own container; a restart resets it to the seed.
const env = loadEnv();
await startFakeGoogle({
  ...env,
  // Every interface of its own container; Compose publishes the port on the host's localhost only.
  host: "0.0.0.0",
  port: Number(new URL(env.serverUrl).port),
});
