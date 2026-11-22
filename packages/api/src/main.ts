import { googleSettingsOffGoogle, loadEnv } from "./core/env";
import { createLogger } from "./core/logger";
import { startServer } from "./core/server";
import { createModules } from "./modules";

const env = loadEnv();
const logger = createLogger(env.logLevel);
const offGoogle = googleSettingsOffGoogle(env);
if (offGoogle.length > 0) {
  logger.warn(
    { settings: offGoogle },
    "Google settings point somewhere other than Google; only development and tests set them",
  );
}
const server = await startServer(env, logger, (core) =>
  createModules(core, { publicUrl: env.publicUrl, resendApiUrl: "https://api.resend.com" }),
);
logger.info({ url: server.url }, "Broccoli Access API listening");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "Shutting down");
    server.stop().catch((error: unknown) => {
      logger.error({ err: error }, "Shutdown failed");
      process.exitCode = 1;
    });
  });
}
