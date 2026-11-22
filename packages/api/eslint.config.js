import {
  eslintConfig,
  maxLinesPerFunctionConfig,
  mutationPayloadsConfig,
} from "@broccoli-access/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(
  eslintConfig(import.meta.dirname),
  mutationPayloadsConfig(),
  maxLinesPerFunctionConfig(50),
);
