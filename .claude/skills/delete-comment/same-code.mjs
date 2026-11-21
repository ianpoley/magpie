import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { parse } from "@typescript-eslint/parser";

const base = process.argv[2] ?? "HEAD";
const changed = execFileSync(
  "git",
  ["diff", "--name-only", "--diff-filter=M", base, "--", "*.ts", "*.tsx", "*.mts", "*.cts", "*.js", "*.mjs", "*.cjs"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

function tokens(code, file) {
  const ast = parse(code, { filePath: file, jsx: file.endsWith("x"), tokens: true, comment: false, loc: false, range: false });
  const kept = ast.tokens
    .filter((token) => !(token.type === "JSXText" && token.value.trim() === ""))
    .map((token) => `${token.type}:${token.type === "JSXText" ? token.value.trim() : token.value}`);
  const out = [];
  for (const token of kept) {
    if (token === "Punctuator:}" && out.at(-1) === "Punctuator:{") out.pop();
    else out.push(token);
  }
  return out;
}

let failures = 0;
for (const file of changed) {
  const before = tokens(execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8", maxBuffer: 1 << 26 }), file);
  const after = tokens(readFileSync(file, "utf8"), file);
  const at = before.findIndex((token, i) => token !== after[i]);
  if (at === -1 && before.length === after.length) continue;
  failures++;
  const i = at === -1 ? Math.min(before.length, after.length) : at;
  console.log(`${file}: code changed at token ${i}: ${before.slice(i, i + 4).join(" ")}  →  ${after.slice(i, i + 4).join(" ")}`);
}
console.log(`${changed.length} files compared, ${failures} with code changes`);
process.exit(failures ? 1 : 0);
