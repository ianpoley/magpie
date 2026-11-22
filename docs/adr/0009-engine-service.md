# ADR 0009: Background services

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/src/config.ts`

#### 0009.1 `SCHEDULE.defaultIntervalHours`

Hours between scheduled syncs unless SYNC_INTERVAL_HOURS in the settings file says otherwise.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L108)

#### 0009.2 `SCHEDULE.backoffMs`

Waits before the retries after the first, second and third failed attempt in a row; later ones wait the normal interval.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L112)

#### 0009.3 `SCHEDULE.requestTtlMs`

A sync request older than this is dropped unrun, counted from when it was made or the last run it waited behind ended.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L114)

#### 0009.4 `SERVICE.defaultPort`

The web service's port unless MAGPIE_PORT says otherwise; clear of `next dev` on 3000.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L121)

#### 0009.5 `Paths.syncRequest`

Present while a sync is requested and not yet started.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L159)

### `packages/engine/src/service/index.ts`

#### 0009.6 `CODE_ROOT`

The code's own clone, which holds the web app and the worker. The data root (MAGPIE_ROOT) is the same directory unless that variable moves it.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L21-L22)

#### 0009.7 `nextBin`

The workspace link, not the resolved file: bun's store path changes with every reinstall.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L25)

#### 0009.8 `serviceSpecs`

The web and worker services for a clone. The PATH starts with the captured node's directory, so anything the services spawn with `node` gets the same one, and includes ~/.local/bin, where the Claude CLI lives.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L28-L32)

#### 0009.11 `installService`

Installs both services, or updates them: runs the setup checks, builds the web app beside the one that is serving (0009.30), writes both unit files, then loads and (re)starts both. The web service keeps running through the build. A failed build leaves the running app, its build and the unit files as they were, so an update that fails while nobody watches never takes the app down.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L271-L275)

### `packages/engine/src/service/launchd.ts`

#### 0009.18 `launchd.start`

A loaded job keeps its old definition, so it is unloaded before the new plist is loaded.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/launchd.ts#L78)

### `packages/engine/src/service/manager.ts`

#### 0009.19 `SERVICE_NAMES`

The two user-level background services: the web app and the sync worker. Each runs the node that installed it directly, with no shell in between. On macOS they are LaunchAgents and on Linux systemd user units; both use these names as their label or unit name.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/manager.ts#L3-L8)

#### 0009.20 `ServiceManager.start`

Once the unit files are written: loads them and starts or restarts every one.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/manager.ts#L39)

#### 0009.21 `ServiceManager.remove`

Stops and unloads the services, before their files are removed.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/manager.ts#L41)

### `packages/engine/src/service/systemd.ts`

#### 0009.22 `specifiers`

`%` starts a specifier in every unit setting.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/systemd.ts#L7)

#### 0009.23 `word`

One ExecStart word: bare when it is plain, otherwise quoted; `$` would expand a variable.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/systemd.ts#L11)

#### 0009.24 `systemd().start`

`enable --now` would leave a running unit on its old definition.

#### 0009.29 `systemd().bootHint`

systemd stops a user's units when their last session ends and does not start them at boot unless lingering is on for that user. Turning it on needs `loginctl enable-linger`, which may ask for a password, so install does not run it. `service:install` and `service:status` print a one-line hint with the command when `loginctl show-user <name> -p Linger` says `Linger=no`. The user is named explicitly: with no argument `loginctl show-user` shows the service manager, not the user. A failed `loginctl` gives no hint. launchd has no such setting, so the macOS manager has no `bootHint`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/systemd.ts#L72)

#### 0009.25 `upgradeSafeNodePath`

`process.execPath` resolves Homebrew's symlinks to `Cellar/node/<version>/bin/node`, and `brew upgrade` deletes that directory, so services pinned to it stop. The keg's `opt/<formula>` link names the same binary and follows upgrades. It is used only while it resolves to the very Node running the install, so the version that passed the setup checks is the one the services run.

The `opt` link follows the formula, not the major version: once Homebrew's `node` moves to 27, the services run a Node outside `engines.node`. `service:status` reports that and exits 1, which is louder than the services stopping on a deleted path.

### `packages/engine/src/release/version.ts`, `packages/engine/bin/next-release.mjs`, `.github/workflows/release.yml`

#### 0009.26 Releases

A version is a `vX.Y.Z` git tag and the GitHub release made from it. No file in the repo holds the number, so a release never commits back to `main`. Every push to `main` runs `next-release.mjs`, which reads the commit messages since the last tag: a `!` after the type or a `BREAKING CHANGE:` footer bumps the major version, `feat:` the minor, and `fix:` or `perf:` the patch. Below 1.0 a breaking change bumps the minor version. A push that has only other types, such as `docs:` or `chore:`, makes no release. The first release is `v0.1.0`.

Releases go out on every push to `main`, not through a release PR, so a fix reaches users without a second merge. This is why the workflow tags directly instead of using release-please, which only releases by merging a release PR it opens.

The bump reads each commit on `main`, which works because the repository allows rebase merges only, so every commit keeps its own message. If squash merges are turned on, the PR title becomes the only message, and a title without a `feat:` or `fix:` prefix makes no release.

### `packages/engine/src/release/update.ts`

#### 0009.27 `updateStatus`

The running version is the newest release tag that the live build's `magpie-commit` contains (`apps/web/<live build>/magpie-commit`, 0009.30). That file exists only after `service:install`, so `next dev` in a worktree never shows the notice. The latest version is the GitHub API's latest release for `RELEASES.repo`. The call needs no token, so while the repository is private it returns 404 and the app shows nothing. Unauthenticated calls are limited to 60 an hour per IP, so the web app checks at most once every `RELEASES.checkEveryMs`. A build with no release tag counts as older than any release: a clone made before the first release, or never pulled since, has no tags. Any failure, offline included, means no notice.

### `apps/web/src/lib/update-status.ts`

#### 0009.28 `checkForUpdate`

The notice tells the user to run `git pull && bun run setup` in the clone, not the `curl` installer. That works from a clone in any folder. Setup runs `bun install` and offers to rebuild the services when the build is behind the code. When the clone has the update hooks (0009.31), the notice drops `&& bun run setup`: the pull applies itself. Every hint in the app and in `service:status` names `bun run setup`, never `bun run service:install`. Setup finds a Node in the supported range itself; `service:install` uses the first `node` on PATH, which under nvm is often too old.

Before the release check, the app looks at its own checkout (`localUpdateStatus`): on `RELEASES.branch` in the main checkout, with a service build older than HEAD, it shows *applying* while the update runner holds its lock, *failed* when the last run for this HEAD failed, and *pending* otherwise. These skip the release check's cache and can't be dismissed, so a pull that was never applied, or failed, stays visible. While applying, the app polls every 5 s and offers a reload once the new build serves.

### `packages/engine/src/service/web-build.ts`, `apps/web/next.config.ts`

#### 0009.30 Two service builds

The services alternate between two build folders, `apps/web/.next-a` and `apps/web/.next-b`. `apps/web/.next-active` names the one that serves. Install builds into the other one with `MAGPIE_NEXT_DIST`, writes `magpie-commit` into it, switches `.next-active`, and only then restarts the services. `next start` reads `.next-active` through `next.config.ts`, so a restart between the switch and the unit rewrite still serves a complete build.

Renaming a finished build into `.next` was tried and rejected: Next writes the build folder's name into the server's route modules, so a renamed build runs with stale paths. `next dev` and a plain `next build` keep using `.next`, so neither touches a live service build. A clone installed before this change serves from `.next` until its next install. `tsconfig.json` lists both folders' `types` paths, because otherwise `next build` rewrites the file.

### `packages/engine/bin/after-pull.mjs`, `packages/engine/src/release/apply.ts`

#### 0009.31 Applying an update after git pull

Setup writes `post-merge` and `post-rewrite` hooks into the clone (0010.20). They fire for every pull style: fast-forward and merge pulls run `post-merge`, and `pull --rebase` runs `post-rewrite rebase` with or without local commits. The hook runs `after-pull.mjs` under the Bun that ran setup. It checks the same things `localUpdateStatus` does (main checkout, on `RELEASES.branch`, services installed from here and on an older commit), then starts a detached runner and returns, so the pull never waits or fails. It removes git's `GIT_*` variables first: hooks get `GIT_DIR`, which would point every later `git` call at the wrong place.

The runner holds `state/update.lock` and runs `bun run setup --after-pull` with no terminal, logging to `logs/update.log`. `setup.mjs` runs `bun install` and finds a Node in range as usual. `--after-pull` then does only one thing: rebuild and restart services that are installed from this clone and run an older commit. It never takes the first-run steps that `--yes` takes, so a pull can't reinstall services the user removed or link a skill they declined. When there is nothing to apply it exits `RELEASES.nothingToApplyExit`, and the run is recorded as skipped. A sync in progress finishes first, up to `RELEASES.syncWaitMs`, because the restart would stop it.

Success means the live build's commit equals the HEAD the run started from. Install reads HEAD before it builds, so a pull during the build leaves the build marked with the older commit, and the next round rebuilds. The runner repeats while it applied a commit and the checkout moved on, up to `RELEASES.applyRounds` times. The result goes to `state/update.json` for the app (0009.28).

Only pulls with the git CLI or a git client fire hooks. A clone updated another way, or one without hooks, gets the *pending* notice instead.

