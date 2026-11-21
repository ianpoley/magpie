---
name: delete-comment
description: Remove code comments from Magpie and keep what they knew. Sorts each comment as tautology, stale, excuse or decision record; deletes tautologies and stale ones, files a GitHub issue for each excuse's hack, moves decision records into docs/adr, then tightens the comment ratchet. Use when asked to delete or clean up comments, to pay down the no-comments ratchet, or when `bun run lint:comments` fails.
argument-hint: "[path or glob, default: every file still in eslint-suppressions.json]"
---

# Delete comments

Magpie bans code comments. The rule is `magpie/no-comments` in the root `eslint.config.mjs`, and `bun run lint:comments` runs it on every `.ts`, `.tsx`, `.js`, `.mjs` and `.cjs` file in the repo. Comments that are still in the code are listed per file in `eslint-suppressions.json`. That file is the ratchet. A file can lose comments, but it cannot gain any, and a new file cannot have any.

The rule does not flag tool directives: `eslint-disable…`, `eslint-enable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `/// <reference …>` and shebangs. CSS, shell, SQL and TOML are not linted. Clean them by hand with the same rubric.

Argument: a path or glob to work on. Without one, work on every file listed in `eslint-suppressions.json`.

## 1. Inventory

```bash
node_modules/.bin/eslint --format json --suppressions-location /tmp/no-suppressions.json <paths> > /tmp/comments.json
```

Point `--suppressions-location` at a file that does not exist so that suppressed comments show up too. Each `magpie/no-comments` message is one comment, with its start and end line. Never find comments with grep or a token scanner. `//` inside a URL, a regex or a template string fools them.

## 2. Classify

Read the code around every comment, then give it exactly one category:

| Category | What it is | Action |
|---|---|---|
| Tautology | Says what the code, a name or a type already says | Delete |
| Stale | Describes code, files, names or behavior that no longer exist or no longer match. Grep before you decide. | Delete |
| Excuse | Explains away a hack, shortcut, workaround, duplication, magic number, "for now" or TODO that should be fixed instead | Delete, then file an issue |
| Decision record | A non-obvious decision or constraint the code cannot express: why X over Y, an external system's quirk, an invariant, an ordering rule, what a threshold means, a compatibility promise | Move it into `docs/adr/`, then delete it |

A comment that loses real information if deleted, and is none of the four, stays for now. An example is CLI usage text that users read. Report it, and leave it to the ratchet.

## 3. Delete

- Remove only comments. Change no code tokens.
- Remove a comment on its own line together with its line, and do not leave doubled blank lines behind.
- For a trailing comment, remove the comment and the whitespace before it.
- Remove a JSX comment `{/* … */}` together with its braces.
- Leave tool directives alone.
- Do not run prettier. The repo has no formatter config.

When the code needs a better name to stand without its comment, rename it in a separate commit. Keep the deletion commit free of code changes.

## 4. Excuses become issues

File one issue per underlying hack. When several excuses describe the same hack, file one issue that lists all of them.

```bash
gh issue create --title "<what to fix, imperative>" --body-file <file>
```

The body has four parts:

- the hack, in one or two sentences
- the proper fix
- the deleted comment, quoted verbatim
- a permalink to it at the commit before the deletion, `https://github.com/ianpoley/magpie/blob/<sha>/<path>#L<a>-L<b>`

## 5. Decision records become ADRs

`docs/adr/` has one file per subsystem, and `docs/adr/README.md` indexes them. Add each decision to its subsystem's file as a new numbered entry. Give it a heading that states the decision, then **Where** (the file and symbol), **Context** (the constraint) and **Decision**. Write it in plain prose, and keep every fact the comment had. Start a new subsystem file only when no existing one fits, and add it to the README.

Commit each ADR entry together with the deletion of its comment, so a decision is never missing from both the code and the ADRs.

## 6. Prove no code changed

```bash
node .claude/skills/delete-comment/same-code.mjs <base-ref>
```

The script compares the token stream of every modified JS and TS file with `<base-ref>`, ignoring comments. It must report `0 with code changes`. Then run the full checks once:

```bash
bun run lint && bun run typecheck && bun run test
```

## 7. Tighten the ratchet

```bash
node_modules/.bin/eslint --quiet --prune-suppressions .
```

This removes every count that went down. Commit `eslint-suppressions.json` along with the deletions. `bun run lint:comments` fails while the file still allows more comments than the code has, so the ratchet can only move down.

## Report

Report these to the user:

- the count in each category
- the issues filed, with their URLs
- the ADR entries added
- the comments that stayed, with reasons
- the lines removed, from `git diff --shortstat`
