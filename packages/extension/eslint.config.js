import { eslintConfig, maxLinesPerFunctionConfig } from "@broccoli-access/config/eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  eslintConfig(import.meta.dirname),
  globalIgnores(["dist/"]),
  maxLinesPerFunctionConfig(50),
);
