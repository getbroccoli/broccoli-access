import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { zipSync } from "fflate";
import type { Plugin } from "vite";

import { EXTENSION_DOWNLOAD_PATH } from "./src/lib/extensionDownload";

/**
 * Serves the extension, zipped, at `EXTENSION_DOWNLOAD_PATH`: the build adds it to the web app's
 * files, so an instance serves the extension of its own commit; the dev server zips it per request.
 */
export function extensionZip(): Plugin {
  return {
    name: "broccoli-access:extension-zip",
    configureServer(server) {
      server.middlewares.use(EXTENSION_DOWNLOAD_PATH, (_request, response) => {
        if (!isExtensionBuilt()) {
          server.config.logger.warn(NOT_BUILT);
          response.statusCode = 404;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(NOT_BUILT);
          return;
        }
        response.setHeader("Content-Type", "application/zip");
        response.end(zipExtension());
      });
    },
    generateBundle() {
      if (!isExtensionBuilt()) {
        this.error(NOT_BUILT);
      }
      this.emitFile({
        type: "asset",
        fileName: EXTENSION_DOWNLOAD_PATH.slice(1),
        source: zipExtension(),
      });
    },
  };
}

/** The extension's build; Turborepo builds it before the web app, which depends on it. */
const EXTENSION_DIST = join(import.meta.dirname, "../extension/dist");

const NOT_BUILT = "The extension isn't built: run pnpm --filter @broccoli-access/extension build";

function isExtensionBuilt(): boolean {
  return existsSync(join(EXTENSION_DIST, "manifest.json"));
}

/** Its files sit at the zip's root, so the folder it unzips to is the one Load unpacked takes. */
function zipExtension(): Uint8Array {
  const files = readdirSync(EXTENSION_DIST, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  return zipSync(
    Object.fromEntries(
      // Zip paths use forward slashes on every system.
      files.map((path) => [
        relative(EXTENSION_DIST, path).split(sep).join("/"),
        readFileSync(path),
      ]),
    ),
  );
}
