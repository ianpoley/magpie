---
title: "Reading secrets from a launchd or systemd user service without a keychain prompt"
date: 2026-11-20
category: tooling-decisions
module: packages/engine/src/secrets
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Changing how the engine stores or reads the X session cookies or the Jev key
  - Replacing /usr/bin/security or secret-tool with a library binding
  - Changing the node binary or program arguments the background services run
  - Spawning bird or Birdclaw from any process with no one at the keyboard
retire_when: "macOS stops honoring a keychain item's creator-binary access list, or bird stops reading browser cookies when AUTH_TOKEN and CT0 are unset. Check by reading a /usr/bin/security item from a throwaway LaunchAgent after a Node upgrade, and by running bird whoami with neither variable set."
tags: [keychain, launchd, systemd, secret-service, security-cli, bird, headless, secrets]
---

# Reading secrets from a launchd or systemd user service without a keychain prompt

## Context

The old sync was a launchd job that broke because something in it read the macOS Keychain and macOS raised a permission prompt that nobody was there to answer. The workaround was a plaintext `~/.birdclaw/bird.env`. The in-app sync runner moved the X cookies and the Jev key into the OS secret store, so it had to answer one question before anything else was built: can a background service read a keychain item with no prompt, and keep doing so after the owner upgrades Node?

## Guidance

**Write and read every macOS secret through `/usr/bin/security`, never through a library linked into `node`.** A keychain item's access list trusts the binary that created it. `/usr/bin/security` carries Apple's signature, which does not change when Node, nvm or Homebrew change. The backend says so at `packages/engine/src/secrets/backends.ts:82-85`, and the default path is set at `packages/engine/src/secrets/store.ts:131`. Never pass `-A` (allow any application) to make a prompt go away.

**Put `node` itself, by absolute path, as the service's first program argument.** The LaunchAgent and the systemd unit run the captured node directly, with no bash wrapper in between (`packages/engine/src/service/launchd.ts`, `packages/engine/src/service/systemd.ts`).

**On Linux, treat the 0600 file as a normal path, not an error path.** The backend is chosen once, by a probe at the first write, and recorded. After that, a failed read is reported as locked or unavailable and never falls back to the file (`packages/engine/src/secrets/store.ts`).

**Never start bird or Birdclaw without both `AUTH_TOKEN` and `CT0` in the child environment.** When either is missing, bird reads browser cookies itself, through the Keychain. That is the second way a headless job hits the prompt, and it is what made the old job need `bird.env`. The adapter refuses to spawn without both (`packages/engine/src/x/birdclaw.ts:73`, the `missingCookies` result returned before every spawn; the reason is the comment at `:105-106`).

## Why This Matters

What was measured in this session (2026-11-20, macOS on Apple silicon, Node 26.5.0):

- A throwaway LaunchAgent ran `/opt/homebrew/Cellar/node/26.5.0/bin/node` as program argument 0. Inside it, `get` read an item that the new backend's `set` had written through `security -i`, using an `x-session`-shaped JSON value and a 1,049-character maximum-length value. Each read took about 20 ms and matched exactly, with no prompt, once right after `launchctl bootstrap` and again after `launchctl kickstart -k` with a new pid.
- All 91 allowed characters, plus values starting with `-` or `#` or containing `;`, round-tripped exactly through `security -i` when single-quoted.

Alternatives rejected, per this session's research as of 2026-11-20, with the reason each would bring the prompt back or lose data:

- **`@napi-rs/keyring` and other native bindings.** The accessing binary becomes `node`. Homebrew's `node` has only a per-build code hash and a versioned Cellar path, so every `brew upgrade` changes the identity the item trusts. On Linux the binding also falls back silently to the in-memory kernel keyring, which is lost at reboot, unless it is pinned to Secret Service.
- **`keytar`.** It is archived.
- **Reading cookies from the browser on each run.** This is the original prompt.
- **A plaintext file as the default.** The owner asked for secrets to be stored securely first.

Per this session's research, which was not verified live: a lingering systemd user service on a machine where nobody logged in has no unlocked Secret Service keyring, because PAM unlocks it at desktop login. That is why the Linux file fallback has to work well.

Keep one limit in mind. Because the item trusts `/usr/bin/security`, any process running as the owner can read it with `security find-generic-password`. On macOS the keychain mainly protects against backups, accidental commits and casual file reads, not against code already running as the owner.

## When to Apply

- Before swapping the secret backend for a library, check whether the reading binary would change.
- Before changing what the LaunchAgent or systemd unit runs as program argument 0.
- When adding any new caller of bird or Birdclaw, such as a new stage, a probe or a CLI command.
- When a Node upgrade is followed by a service that hangs or reports the keychain as locked. Rerunning `bun run service:install` recaptures the node path, and the item does not need rewriting.

## Examples

How to check it again on a new macOS release:

```bash
# write through the backend under a throwaway service name, then read it from a throwaway LaunchAgent
# whose ProgramArguments[0] is the absolute node path; expect an exact match with no prompt,
# then bootout the agent and `security delete-generic-password -s <throwaway>`.
```

How a spawn should look, with cookies in `env` only:

```ts
spawn(command, argv, { env: { AUTH_TOKEN, CT0, BIRDCLAW_BIRD_COMMAND, BIRDCLAW_HOME, HOME, PATH }, detached: true });
```

This is the wrong shape, because bird falls back to the browser Keychain:

```ts
spawn('birdclaw', ['sync', 'bookmarks', '--mode', 'bird'], { env: process.env }); // no AUTH_TOKEN/CT0
```

Related: `docs/solutions/tooling-decisions/headless-claude-cli-isolation-flags.md`, the other headless CLI the same worker calls.
