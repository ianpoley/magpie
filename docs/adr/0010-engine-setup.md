# ADR 0010: Setup and migration

- Status: accepted
- Date: 2026-11-21

## Context

Magpie keeps no comments in its code. The decisions below used to be comments next to the code they explain. Each one records something the code cannot say by itself: why it was done this way, a rule from an outside system, or an invariant that must hold. Each entry names the file and the symbol it applies to, and links to where the comment last appeared, at commit `7ec16b3`.

When the code changes, update or remove the entry here in the same commit.

## Decisions

### `packages/engine/bin/setup.mjs`

#### 0010.1 `setup.mjs (module)`

The first command after cloning. Bun runs this file, because Bun is the one tool a fresh machine is sure to have and a fresh clone has no node_modules yet. It installs the dependencies, finds a Node in the supported range (nvm and other version managers often put an older one first on PATH), then runs the setup walkthrough under that Node, so the services record it.

No dependencies and no TypeScript: it has to run before both are in place.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/bin/setup.mjs#L5-L11)

### `packages/engine/src/migrate/legacy.ts`

#### 0010.2 `migrate (module)`

Moves an install that syncs through the old nightly LaunchAgent, with its cookies in ~/.birdclaw/bird.env and its Jev key in ~/.config/magpie/secrets.env, onto the OS secret store and the two background services. The new setup has to finish one good sync before anything of the old one is deleted, and any failure puts the old one back. The old job's script, `packages/engine/bin/birdclaw-nightly.sh`, and its plist template were deleted from the tree once the owner's install had moved. Putting the old job back now reloads the installed plist, which runs that script from the clone it was installed from, so the put-back gives a working job only in a clone that predates the deletion.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/migrate/legacy.ts#L21-L27)

#### 0010.3 `Stop`

Why the migration cannot go on; the message never holds a secret value.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/migrate/legacy.ts#L53)

#### 0010.4 `migrate`

The OS secret store must work: moving onto the file fallback would only swap one plaintext file for another.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/migrate/legacy.ts#L151)

#### 0010.5 `migrate`

The old job already pulled both histories into Birdclaw's database.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/migrate/legacy.ts#L179)

#### 0010.6 `migrate`

Only a sync that started after the install proves the new services; the first one decides.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/migrate/legacy.ts#L203)

#### 0010.7 `rollBack`

Straight from the OS store and never through the secret store's delete, which would also take the Jev key out of secrets.env.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/migrate/legacy.ts#L262-L263)

#### 0010.8 `rollBack`

Only there if the store fell back to the file after all; the old Jev key stays.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/migrate/legacy.ts#L268)

#### 0010.9 `rollBack`

Harmless to the old job, which never reads it; a later migration marks them again.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/migrate/legacy.ts#L287)

### `packages/engine/src/service/index.ts`

#### 0010.10 `SetupCheck`

`fail` stops an install; `warn` is a supported but degraded setup.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L105)

#### 0010.11 `setupChecks`

Checks what magpie needs: a Node in the declared range, the pinned Birdclaw and bird, the Claude CLI (optional) and a usable OS secret store. The secret store is tried under a throwaway keychain service, so no magpie secret is touched and no backend is recorded. A wrong Node stops the checks there.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/service/index.ts#L114-L120)

### `packages/engine/src/setup/walkthrough.ts`

#### 0010.12 `WalkthroughDeps/walkthrough`

`bun run setup`: checks the machine, then takes each first-run step that is not done yet. At a terminal it asks before each one; with `yes` it takes the steps that hold no secret and replace nothing; with neither it only reports. A run on a machine that is already set up asks nothing.

Everything it touches comes in through `deps`, so tests drive it with fakes.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/setup/walkthrough.ts#L3-L10)

#### 0010.13 `WalkthroughDeps.secret`

Read with echo off; '' means skip.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/setup/walkthrough.ts#L18)

#### 0010.14 `SkillState`

`none`: no ~/.claude, so no Claude Code to give the skill to.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/setup/walkthrough.ts#L51)

#### 0010.15 `walkthrough`

A worktree borrows the main checkout's data and services; it only reports.

[Original comment](https://github.com/ianpoley/magpie/blob/7ec16b34a3a0cf685ba340649b08c1b5a07292d1/packages/engine/src/setup/walkthrough.ts#L81)

#### 0010.16 `oldNightlyLogs`

The retired nightly job wrote a full JSON dump into `logs/nightly-<date>.log` every night, about 25 MB each, and migrate removes the job but not its logs. Setup offers to delete them only at a terminal: `--yes` is for agents, and deleting files is not something an agent should do unasked. While the old job is still installed the step is skipped, since that job still writes them.

### `packages/engine/src/setup/skill-link.ts`, added later

#### 0010.17 `skill-link`

The Claude skill link check moved out of `bin/magpie.mjs` into the engine, so the web Settings page reads the same `SkillState` the CLI does. The CLI imports it from here.

#### 0010.18 `focus step`

The web setup has a third step: show everything (the default) or only show my focus, with a free-text focus box. Only the web setup asks. The CLI walkthrough does not, because X is connected only in the web app. Discovery and evolve wait until a choice is recorded, and saving the choice requests a sync so the first discovery runs right away. Tagging still runs meanwhile.
