# ADR 0017: Tests and fixtures

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `apps/web/test/actions.test.ts`

#### 0017.1 `MAGPIE_STORE scratch store`

The actions find the store through this variable. It is set before they load and never cleared, so no test can reach the real store.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/actions.test.ts#L12-L13)

#### 0017.2 `registerHooks resolver`

Next resolves these two kinds of import when it builds; plain node needs telling.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/actions.test.ts#L19)

#### 0017.3 `refused-input test`

With no store at the configured path, a call that got past its checks would report `no_store`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/actions.test.ts#L78)

### `apps/web/test/ask.test.ts`

#### 0017.4 `test 'a second query aborts the first'`

The first feed ignores the abort, like a response already in the pipe.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/ask.test.ts#L351)

### `apps/web/test/fixtures/sync-env.ts`

#### 0017.5 `sync-env fixture`

```text
A scratch install for the sync actions and the status route: repo root,
store, per-user config and Birdclaw home all in one temp dir, secrets in
the owner-only file (never the OS keychain), and a stub `bird` that acts
on the auth_token it is given:

  good…      whoami names @owner
  probe…     whoami fails without saying why, one page of bookmarks works
  rejected…  whoami fails without saying why, bookmarks get HTTP 401
  offline…   whoami cannot reach X

and a stub TypeSafe that takes Jev keys starting `good` and refuses the
rest, except keys starting `offline`, whose connection it drops.

Importing this sets the environment, so import it before anything that
reads it. Nothing is ever unset, so no test can reach the real install.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/fixtures/sync-env.ts#L10-L26)

#### 0017.6 `TYPESAFE_API_KEY`

A real key in the shell must never be read or sent.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/fixtures/sync-env.ts#L42)

### `apps/web/test/murmuration.test.ts`

#### 0017.7 `SPACE`

A 1440px-wide window in art px: two ~120px gutters either side of a 400px column.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/murmuration.test.ts#L14)

#### 0017.8 `test: after an ask's swirl`

A bird pulled toward the far gutter would sit against the column's edge for good.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/apps/web/test/murmuration.test.ts#L60)

### `packages/engine/test/birdclaw.test.ts`

#### 0017.9 `writeStub`

A shell stub that logs every call (argv and environment) and then acts by its first argument. Output goes through files so it needs no escaping.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/test/birdclaw.test.ts#L26-L29)

### `packages/engine/test/links-resolve.test.ts`

#### 0017.10 `resolveTo`

Every host resolves to a public address unless one is set here.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/test/links-resolve.test.ts#L77)

#### 0017.11 `legacy host-titled video test`

How videos were stored before oEmbed: titled by their host after one attempt.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/test/links-resolve.test.ts#L1009)

### `packages/engine/test/migrate.test.ts`

#### 0017.12 `fakeMachine`

A fake home, clone and config dir, with fakes for launchctl, the keychain, the X check and the service installer. The installer starts the real worker loop with a fake sync, so the migration reads a real worker status file and run row; `worker: 'none'` installs services that never run.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/test/migrate.test.ts#L133-L138)

#### 0017.13 `fakeMachine (t.after teardown order)`

The worker stops before its files go.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/test/migrate.test.ts#L164)

### `packages/engine/test/pipeline.test.ts`

#### 0017.14 `'a post cap bounds how many posts are scored' test`

A pinned search gives the first pass something to score, while the first category list is still to come and brings a second pass with it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/test/pipeline.test.ts#L210-L211)

### `packages/engine/test/worker.test.ts`

#### 0017.15 `worker test t.after`

Release the held run first, so a failed assertion cannot leave stop() waiting on it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/test/worker.test.ts#L132)
