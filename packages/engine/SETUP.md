# x-corpus setup

One-time setup on macOS or Linux, from a clone anywhere on disk. After that the sync runs by itself in the background.

## 1. Install

1. [Bun](https://bun.sh), and Node 26 (`.node-version`; supported range `>=25.8.1 <27`). No Homebrew formulas and no global npm packages: Birdclaw and bird are pinned repo dependencies.
2. In the clone:

```bash
bun run setup
```

Bun runs a small pre-check first. It runs `bun install`, then finds a Node in range: the first `node` on your `PATH` if it fits, otherwise the newest one in the usual places (Homebrew, `/usr/local`, nvm, fnm, Volta, mise, asdf). It names the one it picked. With none, it says how to install Node 26 and stops. Then the walkthrough runs under that Node:

- **Checks:** the Node range, the pinned Birdclaw and bird, the Claude CLI and the secret store. A failed check stops here with the fix.
- **Background services:** installs them (step 2 below). On a Mac with the old `birdclaw-nightly` job it offers `migrate` instead (see below). If the services belong to another clone, it asks before pointing them here; the default is no.
- **Connect X:** opens the web app and waits until you have connected (step 3). Press Enter to skip.
- **Jev key:** typed hidden; Enter skips (step 4).
- **Claude skill:** links `packages/skill` into `~/.claude/skills`.

At a terminal it asks before each step. `bun run setup --yes`, or a run with no terminal, never prompts. `--yes` takes only the steps that hold no secret and replace nothing: the services and the skill. Without `--yes` it only reports. Every run ends with what is done and what is still to do, and skips what is already done. In a linked git worktree it only reports on the main checkout.

Each step also has its own command, described below. On Linux the secret store needs libsecret's `secret-tool` and a running Secret Service; without a secret store, secrets fall back to an owner-only `~/.config/x-corpus/secrets.env` and the app warns about it.

## 2. Install the background services

`setup` does this for you. By hand:

```bash
bun run service:install
bun run service:status
```

This builds the web app and installs two user-level services (LaunchAgents on macOS, `systemd --user` units on Linux): `x-corpus-web` on http://127.0.0.1:3030 (`X_CORPUS_PORT` overrides) and `x-corpus-worker`, which syncs every 3 hours. Change the cadence with `SYNC_INTERVAL_HOURS` in `~/.config/x-corpus/settings.env`. `bun run dev` stays on port 3000.

## 3. Connect X

Open http://127.0.0.1:3030, find the sync panel in the sidebar, press **Connect X**, and paste your `auth_token` and `ct0` cookies. Copy them from the browser's dev tools: Application, Cookies, x.com. The cookies go into the secret store. The first sync starts right away; **Sync now** runs another any time.

Birdclaw syncs using your X browser session cookies, which X's terms do not allow. Your account could be limited or suspended. The cookies give full access to the account, so treat them like a password.

Secrets and the connection are per user; data is per clone. Connecting X from another clone or worktree replaces the cookies the installed service uses. A linked git worktree uses its main checkout's data, state and logs, and refuses `service:install`: install from the main checkout.

The app has no sign-in and listens on loopback only. That assumes a machine where only you have a login: any other local account could open the app, read the corpus, and connect or disconnect X.

## 4. Categorization (optional, recommended)

```bash
bun run secrets:set-jev          # Jev (TypeSafe) key, typed hidden or piped on stdin
claude --version                 # Claude Code CLI, installed and logged in
bash packages/skill/install.sh   # link the Claude skill into ~/.claude/skills
```

The first run resolves every link, asks Claude for the starting categories, and tags the whole corpus; it takes several minutes. Later runs only handle what is new. Without the key or the CLI, the sync and export still work and the step logs a warning.

## 5. Update

```bash
git pull
bun run service:install          # rebuilds and restarts both services
bun run service:status
```

If you upgrade Node and the path the services captured goes away, they stay stopped until you rerun `service:install`; `service:status` reports it.

To remove the services: `bun run service:uninstall`. Add `-- --purge-secrets` to also delete the stored X cookies and Jev key and disconnect X.

## Migrating from the old launchd job

If this machine still runs the old `birdclaw-nightly` LaunchAgent (`bin/birdclaw-nightly.sh`, with `~/.birdclaw/bird.env` and a plaintext `secrets.env`):

```bash
bun install
bun run migrate                  # --timeout-minutes N changes the 15 minute wait
```

It stops the old job but keeps it, moves your X cookies and Jev key into the secret store, installs the two services, and waits for the new worker to finish one good sync. Only after that sync does it delete the old plaintext files and the old job's plist. If any step fails, it rolls back: the new services are removed and the old job is loaded again.

## Notes

- Logs are in `logs/` in the clone: per-run logs plus each service's stdout and stderr.
- If the machine is asleep at a scheduled time, the worker syncs when it wakes.
- A sync requested while another is running is not queued twice; the screen says "already running".
