# Using Magpie

[Back to the README](../README.md)

## Web app

The installed service runs at http://127.0.0.1:3030. `MAGPIE_PORT` changes the port.

- Filter by area and topic, collection, author, keyword, time range and media. The filters are in the URL, so you can bookmark a view.
- **Ask** judges every post against a question. **Pin** saves the question as a search, and later syncs keep it up to date.
- **Resources** lists the repos, packages, videos and pages your posts link to, most saved first.
- Rename, merge, hide or delete topics. Remove a post from the corpus. This does not change anything on X.
- Press `/` to search. Press `j` and `k` to move between cards, and Enter to open one.

You can give Magpie its own window and dock icon. In Chrome or Edge, open http://127.0.0.1:3030 and choose **Install Magpie** from the address bar or the menu. In Safari on macOS, choose **File → Add to Dock**.

[apps/web/README.md](../apps/web/README.md) describes everything on the screen.

## Claude skill

The magpie skill lets Claude Code search your saved posts from any project. You don't run anything yourself. You ask Claude, and Claude runs the skill's search script.

### Install, check and remove

Setup links the skill in step 4. To link it by hand, run `bash packages/skill/install.sh` in your clone. Both put a symlink at `~/.claude/skills/magpie` that points to `packages/skill/`.

To check it, start a new Claude Code session and type `/magpie`. If Claude Code lists the skill, it is installed.

The link points into your clone, so the skill updates when the clone does. Run the install command again, or `git pull`, and the next session uses the new version.

To remove it, delete the link: `rm ~/.claude/skills/magpie`. This leaves the clone and your corpus as they are.

### Ask for what you need

Ask in plain words. Some examples:

- "What have I saved about scroll animations?"
- "Any bookmarks from @steipete about terminal UIs?"
- "Use my saved posts to suggest three ideas for this feature, and cite each one."
- "Which repos and packages do my posts about state machines link to?"

Claude starts from your areas and topics, so it finds posts without guessing the exact word. For a specific name or phrase, it searches by keyword. It answers with the posts it used and cites each one with the `@handle` and the post URL.

Claude also uses the skill on its own when a coding task matches a topic you saved. Type `/magpie` to make it use the skill.

The [agent prompts](agents.md#use-your-saved-posts-in-another-project) include one for pulling ideas into another project.

### What the skill can and can't see

- It reads `data/`, `markdown/` and `state/corpus.sqlite` in your clone, and changes nothing. You edit categories in the web app.
- It leaves out the areas and topics you hid. Ask Claude to include hidden posts when you want them.
- It never shows a post you removed in the web app.
- When no sync from X has succeeded for a day, it tells Claude how old the corpus is. Claude passes that on to you. Run `bun run service:status` to see why the worker stopped.
- The search runs on your machine. Claude may open a post's URL on X to read the full thread.
- The skill reads the store with `node:sqlite`, so the `node` on your `PATH` must be 22.13 or newer. On an older Node, every command stops with an error once the store exists.

### The commands Claude runs

You can run them yourself too:

```bash
node ~/.claude/skills/magpie/query.mjs categories
node ~/.claude/skills/magpie/query.mjs topic "<area or topic>" --limit 8
node ~/.claude/skills/magpie/query.mjs resources "<area or topic>"
node ~/.claude/skills/magpie/query.mjs "state machine" --source bookmarks --json
```

The skill finds your clone from the real path of the link, so the clone can be anywhere on disk. Read [packages/skill/SKILL.md](../packages/skill/SKILL.md) for every command and flag.

## Raw files

Every sync writes plain files that any tool can read:

| Path | What it holds |
|---|---|
| `data/{bookmarks,likes}.normalized.jsonl` | One `{type,id,handle,name,created,url,text}` record per line |
| `markdown/{bookmarks,likes}/` | One `.md` per post with YAML frontmatter, plus `index.md` |
| `state/corpus.sqlite` | Categories, tags, links, your edits and the change log |

> [!WARNING]
> You cannot rebuild `state/corpus.sqlite` from X. It holds your category edits, your fixes to single posts, the posts you removed and the change log. Back it up. Before each schema upgrade, Magpie saves a copy of the old store in `state/backups/`.

## Commands

Run these from the repo root:

```bash
bun run setup            # install deps, check the machine, walk through what is left (--yes: no prompts)
bun run service:install  # build, then install or update both services (uses the node on PATH; setup picks one in range)
bun run service:status   # what is running and how the last sync went; exits 1 when something needs attention
bun run service:uninstall
bun run secrets:set-jev  # store the Jev key
bun run sync             # run one whole sync now
bun run categorize       # categorize only
bun run build:markdown   # rebuild markdown/ and jsonl from existing data/*.json
```

[docs/development.md](development.md) lists the commands for working on the code.

## Things to know

- **Secrets and services belong to your user. Data belongs to each clone.** The cookies, the Jev key and the connection are in the macOS Keychain or the Linux Secret Service (service `magpie`), and in `~/.config/magpie`. The corpus is in each clone. If you connect X from another clone or worktree, you replace the cookies that the installed service uses. If you run `service:install` from another clone, both services then use that clone.
- **Worktrees use the main checkout's corpus.** A linked git worktree reads `data/`, `state/` and `logs/` from its main checkout. So a dev server in a worktree shows your real posts and the real worker's status, and your edits there change your real store. A worktree never upgrades the schema of that store. To test a branch with a store migration, point `MAGPIE_ROOT` at a copy. `setup` and `service:install` refuse to install services from a worktree, and they name the main checkout. `MAGPIE_ROOT` sets the data root.
- **No sign-in.** The web app answers loopback requests only and has no login. This assumes that only you have a login on the machine.
- **Ports.** The service uses 3030. `bun run dev` uses 3000, so a dev server and the service never use the same port.
- **Sync interval.** Set `SYNC_INTERVAL_HOURS` in `~/.config/magpie/settings.env`. The default is 3.
- **Secret fallback.** If no keychain works, Magpie writes the secrets to `~/.config/magpie/secrets.env`, which only you can read, and the app shows a warning.
- **History fills in over time.** The first sync of each collection gets its full history. X rate-limits the likes endpoint, so likes can take several syncs to arrive.
- **Node upgrades.** With Homebrew's Node, the services run it through `/opt/homebrew/opt/node`, so `brew upgrade` does not stop them. With another version manager, the services stop if the old Node path goes away. Run `bun run setup` again to fix this. `service:status` tells you when it happens.
- **Updates.** `git pull` on `main` applies itself: git hooks that setup installs rebuild the app and restart the services in the background, and the app keeps running until the new build is ready. The sidebar shows the update while it runs, and it says so when an update didn't finish. The log is `logs/update.log`. Without the hooks, run `bun run setup` after the pull.
