# ADR 0003: Sync: X, the run, the worker and the scheduler

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/bin/birdclaw-nightly.sh`

#### 0003.1 `PATH export`

launchd starts jobs with a bare PATH; make brew + node reachable.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/birdclaw-nightly.sh#L22)

#### 0003.2 `bird nvm lookup`

birdclaw shells out to `bird`, which npm installs under the active nvm node (not on launchd's bare PATH). Prefer whatever `bird` is already reachable, else the newest nvm-installed one, and fail loudly if neither exists.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/birdclaw-nightly.sh#L40-L42)

#### 0003.3 `categorize step`

```text
4) Categorize: resolve links, tag new posts, and evolve the category list.
   Runs last and never fails the job: the export above is already written.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/birdclaw-nightly.sh#L98-L99)

### `packages/engine/bin/worker.mjs`

#### 0003.4 `worker.mjs shutdown`

On SIGTERM or SIGINT it kills any bird or Birdclaw process a run started, releases the run lock and exits 0. The interrupted run's row is closed as interrupted by the next run.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/worker.mjs#L5-L7)

#### 0003.5 `shutdown (x.killActive)`

The tool processes run in their own process groups, so stopping this process alone would leave them running.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/worker.mjs#L34-L35)

### `packages/engine/src/config.ts`

#### 0003.6 `X_SYNC.limit`

Results per sync and export call: effectively all of them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L99)

#### 0003.7 `X_SYNC.backfillRetryMs`

After a failed full-history sync of a collection, the next try waits this long; incremental syncs run meanwhile.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L103)

#### 0003.8 `Paths.lock`

Held for the whole of a sync or categorize run; its live owner means a run is in progress.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/config.ts#L153)

### `packages/engine/src/ingest.ts`

#### 0003.9 `decodeEntities`

X escapes only these three characters in post text. `&amp;` goes last so `&amp;lt;` stays `&lt;`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/ingest.ts#L84)

#### 0003.10 `ingest`

Loads the bookmarks and likes exports into the store as one row per post.

A post's flags follow which export files it appears in. A post in neither file keeps its row with the flags cleared, unless that collection's export shrank past the guard, in which case its flag is left as stored.

Both files are read and checked before the store is touched, and every write happens in one transaction: an unreadable or malformed file throws and leaves the store as it was.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/ingest.ts#L166-L176)

### `packages/engine/src/lock.ts`

#### 0003.11 `bootIdentity`

Names the current boot of this machine, or null when it cannot be read. Both are random ids fixed for the life of a boot. The boot time is not used: macOS moves it when the clock is stepped, which would make a live lock look stale.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/lock.ts#L11-L16)

#### 0003.12 `isAlive`

EPERM: the process exists but belongs to someone else.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/lock.ts#L39)

#### 0003.13 `lockHolder`

The pid of the process running a sync, read from the lock file at `path`, or null when no run is in progress. A lock counts only while its owner is alive, was started in this boot, and is not this process: after a reboot, or in a process that reused a dead owner's pid, the old lock is stale.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/lock.ts#L54-L59)

#### 0003.14 `acquireLock`

Takes the lock file at `path` for this process, so two runs never overlap. A stale lock (see `lockHolder`) is taken over; a live one is left alone and reported with its owner's pid.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/lock.ts#L68-L72)

#### 0003.15 `acquireLock draft link`

Written whole under a private name, then linked into place: the link fails when the lock exists, and a reader never sees a half-written file.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/lock.ts#L75-L76)

### `packages/engine/src/pipeline.ts`

#### 0003.16 `PipelineOptions.limitPosts`

At most this many posts are scored in the run, counted across both tagging passes.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/pipeline.ts#L31)

#### 0003.17 `StageName`

A whole sync records the X stages first: `x_auth` checks the session, `x_bookmarks` and `x_likes` sync each collection, `export` writes the JSON exports and `markdown` builds the browsable files from them. The categorize stages follow. `tag` is the pass over what the run started with; `retag` is the pass that scores posts against topics the same run created. A run records `discovery` while no automatic topic exists and `evolve` once one does, never both.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/pipeline.ts#L38-L46)

#### 0003.18 `StageOutcome`

ok       the stage did its work warning  it finished, but part of its work is left for a later run failed   it did nothing useful: it threw, or no post could be scored skipped  it was not attempted

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/pipeline.ts#L60-L65)

#### 0003.19 `OpenRun.stage`

Runs one stage and records it. A stage that throws is recorded as failed; one whose work returns null did not apply and leaves no record.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/pipeline.ts#L90-L93)

#### 0003.20 `startRun`

Closes any run row a killed run left `running`, then inserts this run's row. The caller must hold the run lock, which is what makes a `running` row stale.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/pipeline.ts#L97-L100)

#### 0003.21 `runPipeline`

The categorize stages of a run: load the exports, resolve links, score posts against topics, then let the category list grow (the first list when none exists, new and split topics afterwards) and score posts against whatever was added. Records `upstream` on the run row first and finishes the row last.

Each stage commits its own work and is recorded in `run_stages`. A stage that fails does not stop the ones after it, with one exception: when no post could be scored, the category list is left alone for that run. So the run row ends `complete` whenever the run reached its end, and its message names any stage, from the whole run, that failed or warned. Only a run that was killed ends `failed`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/pipeline.ts#L134-L147)

### `packages/engine/src/sync/backfill.ts`

#### 0003.22 `BackfillEntry`

```text
Which collections have had their full-history sync, kept under `backfill`
in the scheduler state file:

  { "backfill": { "bookmarks": { "completedAt": "<ISO time>" }, "likes": { "failedAt": "<ISO time>" } }, ... }

The file's other keys belong to the scheduler and are kept as they are.
A missing or unreadable file means no collection is backfilled yet.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/backfill.ts#L6-L14)

#### 0003.23 `backfillMode`

How the next sync of `collection` runs: a full-history backfill until one has succeeded, except that after a failed one the next try waits a day and the runs in between sync incrementally.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/backfill.ts#L23-L27)

### `packages/engine/src/sync/run.ts`

#### 0003.24 `XAuthStatus`

```text
What the X auth check found:
  ok             the session works; `handle` is null when X confirmed it without naming the account
  rejected       X refused the session
  transient      X, the network or the secret store could not answer: try again later
  not_connected  no X session is stored
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/run.ts#L30-L36)

#### 0003.25 `runSync`

One whole sync: check the X session, sync bookmarks and likes, export them to JSON, build the markdown, then categorize. Everything runs under the run lock and is recorded in one run row, X stages first.

Without a stored session nothing talks to X: the run records `x_auth` as skipped and categorizes the exports already on disk. When the check fails, neither collection is synced, but the export from the local Birdclaw database still runs. A collection's sync failing fails only that stage.

Returns `locked`, having touched nothing, while another live run holds the lock. Throws when the store cannot be opened.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/run.ts#L77-L89)

#### 0003.26 `runCategorize`

The categorize stages alone, under the same run lock. The upstream X sync is read from the sync status file the legacy sync script writes.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/run.ts#L98-L101)

#### 0003.27 `readSyncStatus`

```text
How the X sync that ran before this went, as the legacy sync script records
it: one entry per collection with the exit status of its `birdclaw sync`
and when it ran:

  { "bookmarks": { "exit": 0, "at": "<ISO time>" }, "likes": { "exit": 0, "at": "<ISO time>" } }

Any nonzero exit means failed. It is ok only when both collections report
zero. A missing or unreadable file, or a missing collection, means unknown.
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/run.ts#L220-L229)

### `packages/engine/src/sync/scheduler.ts`

#### 0003.28 `ScheduleInput.lastBusyAt`

The last time a run was seen in progress. A request that waited behind it is fresh for its full time after.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/scheduler.ts#L12)

#### 0003.29 `decide`

What the worker does on this tick. Nothing starts while a run is in progress, and a pending request then stays for later. Otherwise a fresh request runs whatever the schedule says, which is how Sync now checks a rejected session again. Without one, a run starts once the next scheduled time has passed, so a worker that wakes or starts late catches up at once.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/scheduler.ts#L45-L51)

#### 0003.30 `decide`

An unreadable time parses to NaN and is never fresh.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/scheduler.ts#L57)

### `packages/engine/src/sync/state.ts`

#### 0003.31 `readJsonObject/writeJson (module)`

The small JSON files the worker, the web app and the CLI share. None holds a secret. Every write goes to a `.tmp` file that is then renamed into place, so a reader never sees half a file. A missing or unreadable file reads as empty, never as an error.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L7-L12)

#### 0003.32 `updateJson`

Reads the object at `path` now, applies `change` and writes the result, so keys others wrote are kept.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L30)

#### 0003.33 `XConnection`

The X connection record: who is connected and since when. `connectedAt` is the connection generation; a rejection counts only for the generation it names, so a run that used older cookies can never pause a newer connection.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L37-L39)

#### 0003.34 `SyncRequest`

A sync request: present from a Sync now click (or a new connection) until the worker starts the run it asked for.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L65-L66)

#### 0003.35 `readSyncRequest`

The pending request, or null when there is none. A file that cannot be read as a request has an empty `createdAt`, which never counts as fresh.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L74-L77)

#### 0003.36 `SchedulerState/writeSchedulerState`

The scheduler's part of the scheduler state file. The `backfill` key in the same file belongs to the sync run and is left alone.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L98-L99)

#### 0003.37 `AttemptResult`

```text
How one worker-started run ended:
  ok             X answered and both collections synced
  failed         the run could not start, or a collection's sync failed
  transient      X, the network or the secret store could not answer
  rejected       X refused the stored session
  not_connected  no X session is stored
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L101-L108)

#### 0003.38 `SchedulerState.consecutiveFailures`

`consecutiveFailures` counts failed and transient attempts since the last one that was not.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L120)

#### 0003.39 `WorkerStatus`

The worker's status, rewritten every tick. A heartbeat older than a couple of ticks means no worker is running.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L153-L154)

#### 0003.40 `ScheduleStatus`

```text
What the schedule is waiting for:
  scheduled      the next interval
  backoff        a retry after a failed attempt
  paused         X rejected the session; nothing is scheduled until a reconnect
  not_connected  X is not connected; nothing is scheduled
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L156-L162)

#### 0003.41 `WorkerStatus.state`

`running` while any sync holds the run lock, the worker's own or another command's.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/state.ts#L168)

### `packages/engine/src/sync/worker.ts`

#### 0003.42 `classify`

How a run went, for the schedule. A failed categorize stage is not a failed attempt: only the X side decides when to retry.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/worker.ts#L48-L51)

#### 0003.43 `startWorker`

The background sync worker. Every tick, also while a run is in progress, it writes its heartbeat to the worker status file, reads the schedule's state, settings, X connection and any sync request, and asks the scheduler whether to start a run. A run is never awaited by the tick, so a long backfill does not stop the heartbeat; and while one is in progress, here or in another command, no second run starts and a request waits.

After a run it records the attempt for the schedule. When X rejected the session it marks the connection it ran with as rejected, which pauses the schedule; when X accepted it, it clears any rejection of that connection and fills in the handle.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/worker.ts#L59-L71)

#### 0003.44 `startWorker record`

Only the connection the run used: after a reconnect, a stale result changes nothing.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/worker.ts#L94)

#### 0003.45 `startWorker start`

Tick again soon, so a request that waited behind this run starts and the status shows the result. Deferred to the event loop, never straight from here, so a state that keeps asking for a run cannot starve the timers and signal handlers. After a failed record, the regular tick decides.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/sync/worker.ts#L128-L132)

### `packages/engine/src/x/birdclaw.ts`

#### 0003.46 `WhoamiResult`

```text
The X auth check:
  ok               the cookies work; `handle` is null when only the bookmark probe confirmed them
  missing_cookies  one or both cookies are absent, so nothing ran
  rejected         X refused the cookies
  transient        a network problem, rate limit, server error or timeout: try again later
```

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L17-L23)

#### 0003.47 `XAdapter.export`

Writes the collection's stored posts to `outFile`, replacing it only when the export succeeds.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L43)

#### 0003.48 `AUTH`

X refused the cookies: HTTP 401 or 403, or its "Could not authenticate you" error code.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L54)

#### 0003.49 `HANDLE`

bird whoami --plain prints `user: @handle (Display Name)`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L56)

#### 0003.50 `Birdclaw.killActive`

Kills every bird and Birdclaw child still running, with the children they started. Each runs in its own process group, so a service manager stopping this process would not stop them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L76-L80)

#### 0003.51 `createBirdclaw tools`

Resolved on first use, so a missing pinned tool fails that call, not construction.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L101)

#### 0003.52 `run spawn detached`

Its own process group, so a timeout also stops the bird child Birdclaw started.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L133)

#### 0003.53 `whoami bookmark probe`

bird's last whoami fallback scrapes a settings page, and its error hides the HTTP status before it. One page of bookmarks with the same cookies settles whether X refuses them.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L186-L188)

#### 0003.54 `export NUMERIC_ID filter`

An empty Birdclaw database seeds demo posts with ids like `tweet_006`.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/x/birdclaw.ts#L246)

#### 0003.55 `playableMedia`

Videos and GIFs are fetched when someone presses play in the post window, not at sync. `bird` gives each video a direct `video.twimg.com` MP4 (`videoUrl`), but birdclaw, up to at least 0.17.1, keeps only the thumbnail from `bird`, so the export and the store hold no video links. Reading one post with `bird read <id> --json` uses the same signed-in session as sync. The link is kept in the page's state, not the store: it can expire, and storing it would need a migration. Only `https` links on `video.twimg.com` are passed on.

The browser streams the MP4 straight from X; nothing is downloaded or proxied. X's CDN refuses requests that carry a `Referer` (403) and serves the same request without one, and `<video>` has no per-element referrer setting, so the web app sends `no-referrer` for the whole document (`layout.tsx`).
