import { resolve } from "node:path";

import { defineConfig } from "vite";

// Chrome loads `dist/` unpacked: the manifest names `background.js` and the two pages by path.
export default defineConfig({
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "src/popup.html"),
        pair: resolve(import.meta.dirname, "src/pair.html"),
        background: resolve(import.meta.dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
