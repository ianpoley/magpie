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

#### 0009.9 `ServiceOptions.migrating`

Set by `migrate`, which installs while the old job is still on disk and removes it after a good sync.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L200)

#### 0009.10 `legacyInstall`

The old nightly job's plist when `migrate` can move it: on macOS, with the plist and its cookie file both present. Without the cookie file migrate has nothing to move and refuses, so nobody is sent there. Null otherwise.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L209-L213)

#### 0009.11 `installService`

Installs both services, or updates them: runs the setup checks, stops the web service, builds the web app, writes both unit files, then loads and (re)starts both. A failed build leaves the unit files as they were.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L271-L275)

#### 0009.12 `installService`

Migrate holds its own paths and keychain service for its cleanup and rollback; the next install renames.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L281)

#### 0009.13 `installUnits`

Read again: a rename from the old names has just moved the config directory.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L288)

#### 0009.14 `handOverLegacyNames`

Moves an install from the x-corpus names to the Magpie names in one go, so old and new names are never in use side by side: stops the old services, copies the secrets to the new keychain service and reads them back, renames the config directory, installs and starts the services under their new names, and waits for the renamed worker's heartbeat. Only then does it delete the old secrets and unit files. Any failure before that puts every step back and restarts the old services.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L330-L338)

#### 0009.15 `handOverLegacyNames`

Only the default service names move: a keychain service set by hand stays where it was put.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L345)

#### 0009.16 `handOverLegacyNames`

Only a heartbeat written after the old worker stopped proves the renamed one.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L366)

#### 0009.17 `serviceStatus`

Until the rename hands them over, the services that run are the ones under the old names.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L476)

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

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/systemd.ts#L72)
