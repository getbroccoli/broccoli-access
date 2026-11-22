import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts"],
  platform: "node",
  format: "esm",
  // Keep the source layout in dist, so paths resolved from import.meta.url still hold.
  unbundle: true,
  fixedExtension: false,
  sourcemap: true,
  // Workspace packages ship TypeScript source, which Node does not run from node_modules.
  noExternal: [/^@broccoli-access\//],
  // Modules read their SDL from next to their code.
  copy: [{ from: "src/**/*.graphql", flatten: false }],
});
