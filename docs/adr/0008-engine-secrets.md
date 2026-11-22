# ADR 0008: Secrets

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `apps/web/src/lib/types.ts`

#### 0008.1 `SyncState.secretBackend`

Where secrets are kept; "file" is the owner-only fallback file. Null before any secret was stored.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/src/lib/types.ts#L167)

### `packages/engine/bin/birdclaw-nightly.sh`

#### 0008.2 `BIRD_ENV`

Live X credentials for the bird transport (AUTH_TOKEN / CT0). Kept outside the repo so tokens are never committed. birdclaw shells out to `bird`, which reads these env vars — no browser cookies / Keychain needed, so this works headless.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/birdclaw-nightly.sh#L25-L27)

### `packages/engine/src/config.ts`

#### 0008.3 `SECRETS.timeoutMs`

How long one call to the OS secret tool may run before it counts as locked.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L84)

#### 0008.4 `SERVICE.probeKeychainService`

The keychain service the setup check writes, reads and deletes a random value under. Never holds a real secret.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L123)

#### 0008.5 `Paths.secrets`

The file fallback for secrets, and the legacy home of the Jev key.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L162)

#### 0008.6 `Paths.secretBackend`

Which secret backend the first write chose. Not secret.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L165)

#### 0008.7 `SecretSettings.forceFileBackend`

MAGPIE_SECRET_BACKEND=file, for tests only: the OS secret store is never touched.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L311)

### `packages/engine/src/secrets.ts`

#### 0008.8 `parseSecrets`

Reads `KEY=value` lines, with an optional `export` and optional quotes. Nothing is expanded or executed; lines in any other shape are ignored.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets.ts#L7-L10)

### `packages/engine/src/secrets/backends.ts`

#### 0008.9 `SecretFailure`

```text
Why a secret could not be read, written or deleted:
  locked       the OS secret store did not answer in time or refused without asking the user
  unavailable  the store or the fallback file cannot be used
  invalid      the value was refused before anything was written
Messages never contain a secret value.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L7-L13)

#### 0008.10 `SecretBackend`

One place secrets live. Accounts and values are checked by the caller before they get here.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L19)

#### 0008.11 `runTool`

A tool that exits before reading its input breaks the pipe; the close handler reports that.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L54)

#### 0008.12 `SECURITY_NOT_FOUND / SECURITY_LOCKED`

`security` exits with the low byte of the keychain status code. errSecItemNotFound  (trailing, on 44) errSecInteractionNotAllowed: the keychain is locked and no one can be asked  (trailing, on 36) errSecAuthFailed  (trailing, on 51) userCanceled  (trailing, on 128)

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L73-L78)

#### 0008.13 `securityBackend`

The macOS login keychain through `/usr/bin/security`. The item's access list trusts the binary that created it, and Apple's `security` keeps a stable signature across upgrades where `node` does not, so a background service reads without a prompt. Writes go on stdin through `security -i`, so the value is never in an argument list. `-A` (any app may read) is never used.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L81-L87)

#### 0008.14 `secretToolBackend`

The Linux Secret Service through libsecret's `secret-tool`, with the value on stdin.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L120)

#### 0008.15 `secretToolBackend.get`

A lookup that matches nothing exits 1 and says nothing.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L138)

#### 0008.16 `fileKey`

`x-session` is kept as `X_SESSION`, so the Jev key keeps its old name, `TYPESAFE_API_KEY`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L157)

#### 0008.17 `fileBackend`

The warned fallback: `KEY='value'` lines in an owner-only file, the same file and format the Jev key has always used. A file other users can read or change is refused rather than trusted.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L162-L166)

#### 0008.18 `fileBackend.delete`

Deleting only takes a secret away, so it goes ahead whatever the file's mode.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/backends.ts#L227)

### `packages/engine/src/secrets/store.ts`

#### 0008.19 `XSession`

The X cookie pair, kept as one item so a reader never sees half of a reconnect.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/store.ts#L11)

#### 0008.20 `BackendName`

`keychain` is the OS secret store: the macOS keychain or the Linux Secret Service.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/store.ts#L18)

#### 0008.21 `SecretStoreOptions.securityPath`

Defaults to Apple's `/usr/bin/security`, the binary the keychain items trust.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/store.ts#L36)

#### 0008.22 `COOKIE`

Cookie values are URL-safe tokens. Anything else, in particular a quote, backslash, space or newline, could break out of the `security -i` line.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/store.ts#L42-L43)

#### 0008.23 `API_KEY`

Printable ASCII without quotes or backslashes, for the same reason.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/store.ts#L46)

#### 0008.24 `createSecretStore`

The magpie secrets. The first write picks the backend, the OS secret store when a probe of it works and the owner-only file otherwise, and records the choice. Every later read and write uses only the recorded backend, so a locked store is reported, never silently swapped for the file.

Before anything is recorded, the Jev key is read as it always was: from TYPESAFE_API_KEY in the environment, then from the secrets file.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/store.ts#L136-L144)

#### 0008.25 `createSecretStore.delete`

Clearing the OS store is required only where secrets live there; on a file-fallback machine it is a courtesy that may fail.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/secrets/store.ts#L225-L226)

### `packages/engine/src/x/birdclaw.ts`

#### 0008.26 `clean`

Removes every cookie value from child output, then caps it. Cleaning first means a cap can never leave half a value.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L66)

#### 0008.27 `childEnv`

The cookies travel only in this environment, built from nothing so no other secret in the parent's environment reaches the child. bird reads AUTH_TOKEN and CT0 itself and never falls back to browser cookies while both are set; PATH starts with this node, so the tools' `#!/usr/bin/env node` lines run on the same pinned runtime. NODE_ENV is passed on as the parent has it: it is no secret, and Next declares it a required `process.env` key, so carrying it lets the environment type-check as `ProcessEnv` under the web app's tsconfig without a cast.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L104-L108)

#### 0008.28 `run`

The single place bird and Birdclaw are spawned, and only with both cookies.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L120)

### `packages/engine/test/migrate.test.ts`

#### 0008.29 `failed-migration test (legacy secret store)`

A legacy categorize builds a store with no backend recorded, which reads the Jev key from secrets.env.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/test/migrate.test.ts#L378)
