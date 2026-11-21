import { eslintConfig, maxLinesPerFunctionConfig } from "@broccoli/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(eslintConfig(import.meta.dirname), maxLinesPerFunctionConfig(50));
