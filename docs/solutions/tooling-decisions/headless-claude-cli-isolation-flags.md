---
title: "Isolating a headless Claude Code CLI call: what each flag removes and what the session still reports"
date: 2026-11-19
category: tooling-decisions
module: packages/engine/src/claude
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Changing the arguments the engine passes to the Claude Code CLI
  - Verifying by a live call that the categorize pipeline's Claude session can take no action
  - Adding a runtime check on what the CLI session reports
  - Upgrading the Claude Code CLI
retire_when: "The Claude Code CLI changes what --tools, --safe-mode or --json-schema do, or what the system/init event lists. Check by making one live call with the engine's argument list and comparing the init event's tools, mcp_servers, skills, slash_commands and plugins fields with the Guidance section."
tags: [claude-code-cli, headless, prompt-injection, isolation, structured-output, stream-json]
---

# Isolating a headless Claude Code CLI call: what each flag removes and what the session still reports

## Context

The categorize pipeline sends untrusted post text to Claude through the Claude Code CLI under the user's own login (`packages/engine/src/claude/cli.ts`). The session must be unable to act on anything an injected instruction asks for.

The plan first assumed `claude --print --tools ""` gave such a session. Plan review caught that `--tools ""` removes only the built-in tools. A live call then showed that even the full flag set leaves a session report that does not look empty. Three places in the tree still describe the session as cleaner than the CLI reports it:

- The comment above `cliArgs` in `packages/engine/src/claude/cli.ts` lists plugins among the customizations the session runs without.
- KTD4 in `docs/plans/2026-11-19-1053-feat-corpus-screen-categories-plan.md` says the flags keep plugins out of the session.
- The verification line of the Claude adapter unit in the same plan expects a call that "reports no MCP servers and no tools available".

## Guidance

**The argument list.** `cliArgs` passes these, and `packages/engine/test/claude-cli.test.ts` fails if an isolation flag goes missing or if prompt text reaches the arguments:

| Flag | What it does here |
|---|---|
| `--tools ""` | Removes the built-in tools. Nothing else. |
| `--strict-mcp-config`, with no `--mcp-config` | No MCP server loads. |
| `--safe-mode` | Starts without the user's customizations (CLAUDE.md, skills, hooks, custom commands and agents). |
| `--disable-slash-commands` | Disables skills and commands. |
| `--no-session-persistence` | The session is not saved and cannot be resumed. |
| `--output-format stream-json --verbose` | Needed to see the session report at all. See below. |

The prompt goes on stdin, so nothing in a post can be read as an argument.

**What a correctly isolated session reports.** Measured on Claude Code 2.1.328 over three live calls, the `system/init` event read the same each time:

- `tools` is `["StructuredOutput"]`, not empty. `--json-schema` adds this tool, and the model answers through it with one `tool_use` per call. It is not a built-in tool and cannot act on the machine.
- `mcp_servers`, `skills` and `slash_commands` are empty.
- `plugins` still lists the installed plugins, although `claude --help` says `--safe-mode` starts with installed plugins disabled. The listing may be an inventory and not a sign that they are active: the same event shows no skills, commands or MCP servers, which is what a plugin would contribute. That was not tested further, so treat "plugins are out of the session" as unproven and do not read the list as a regression.
- `agents` lists the CLI's built-in agent types.

**Where the report is.** Only the `system/init` event of `--output-format stream-json --verbose` carries the tool, MCP and plugin lists. Plain `--output-format json` returns the result alone, so it cannot be used to verify isolation. The adapter returns the init event as `session` on every successful `send`.

**Rejected alternatives.**

- `--bare`: per this session's finding it never reads the OAuth login, and this machine has no Anthropic API key, so the call cannot authenticate.
- A runtime guard that fails a call when the init event reports any tool, MCP server or plugin: `StructuredOutput` is always present and plugins are always listed, so a naive "all lists empty" guard fails every call. It was not built. A guard that would hold is narrower: `tools` equals exactly `["StructuredOutput"]`, and `mcp_servers`, `skills` and `slash_commands` are empty.

## Why This Matters

The session reads text written by strangers. If one isolation flag is dropped, an injected instruction can reach whatever that flag was keeping out: `--tools ""` alone leaves every configured MCP server, skill and slash command available.

The second cost is a false alarm. Someone who verifies isolation by reading the init event sees a tool and a list of plugins, concludes the flags stopped working, and spends time on a regression that is not one. Or they add the naive guard and discovery stops running.

## When to Apply

- Before removing, reordering or replacing any flag in `cliArgs`.
- When a live verification shows a non-empty `tools` or `plugins` list.
- After a Claude Code CLI upgrade: repeat one live call and compare the init event with the list above.
- When reaching for `--output-format json` to simplify parsing.

## Examples

Reading the session report from an adapter call:

```ts
const sent = await createClaudeCli().send({ prompt, schema });
if (sent.ok && sent.session) {
  const { tools, mcp_servers, skills, slash_commands } = sent.session;
  // Expected on CLI 2.1.328: ["StructuredOutput"], [], [], []
}
```

The offline test stubs the CLI and cannot see what a real session loads. Only a live call shows the init event, and each live call spends the user's Claude allowance, so keep it to one small prompt.

## Related

- `packages/engine/src/claude/cli.ts`: `cliArgs`, `readStream`
- `packages/engine/test/claude-cli.test.ts`: "every spawn carries the isolation flags and the prompt travels on stdin only"
- `packages/engine/README.md`, Credentials section
