import tsParser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";

import noComments from "./eslint-rules/no-comments.mjs";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.next-a/**",
    "**/.next-b/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    ".claude/**",
    "data/**",
    "markdown/**",
    "state/**",
    "logs/**",
  ]),
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off", reportUnusedInlineConfigs: "off" },
    plugins: { magpie: { rules: { "no-comments": noComments } } },
    rules: { "magpie/no-comments": "error" },
  },
]);
