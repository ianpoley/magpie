import assert from "node:assert/strict";
import { test } from "node:test";

import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";

import noComments from "./no-comments.mjs";

const linter = new Linter({ configType: "flat" });
const config = [
  {
    files: ["**/*.tsx"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off", reportUnusedInlineConfigs: "off" },
    plugins: { magpie: { rules: { "no-comments": noComments } } },
    rules: { "magpie/no-comments": "error" },
  },
];

const flagged = (code) =>
  linter.verify(code, config, "file.tsx").filter((message) => message.ruleId === "magpie/no-comments").length;

test("flags line, block, doc and JSX comments", () => {
  assert.equal(flagged("// line\nconst a = 1; // trailing\n/* block */\n/** doc */\nexport const b = <div>{/* jsx */}</div>;"), 5);
});

test("allows tool directives and shebangs", () => {
  const code = [
    "#!/usr/bin/env node",
    "/// <reference types=\"node\" />",
    "// eslint-disable-next-line no-console -- reason",
    "/* eslint-enable */",
    "// @ts-expect-error: untyped module",
    "// @ts-ignore",
    "// @ts-nocheck",
    "const m = import(/* turbopackIgnore: true */ \"./m.js\");",
    "const n = import(/* webpackChunkName: \"n\" */ \"./n.js\");",
    "const a = 1;",
  ].join("\n");
  assert.equal(flagged(code), 0);
});

test("does not mistake URLs in strings or regexes for comments", () => {
  assert.equal(flagged('const url = "https://x.com/a";\nconst re = /https?:\\/\\//;\nconst t = `//${url}`;'), 0);
});

test("a directive word later in the comment is still a comment", () => {
  assert.equal(flagged("// see eslint-disable usage\n// note @ts-ignore"), 2);
});
