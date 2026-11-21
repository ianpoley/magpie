# Concepts

> Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound captures and refreshes learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Sync and secrets

### X session
The owner's pair of X browser session cookies (`auth_token` and `ct0`). The sync uses them to read bookmarks and likes, and they grant full access to the X account.

The pair is always stored, read and replaced together, so a reader never sees one cookie from an old connection with one from a new one.

### Secret backend
Where this install keeps its secrets: the OS keychain (macOS Keychain or Linux Secret Service), or the owner-only file fallback when no keychain works.

The backend is chosen once, at the first secret write, and recorded. Every later read and write uses the recorded backend. A keychain that later can't be read is reported as locked and never falls back to the file. Changing backends is a deliberate step: purge the secrets, then connect again.

### File fallback
The secret backend made of one plaintext file that only the owner can read. It is used where no keychain works. While it is in use, the app shows a warning and the service status command names it.

### Connection generation
The moment the owner last connected X, used as an identity for that connection. An X rejection is recorded against the generation whose cookies were rejected. A rejection recorded for an older generation is ignored, so a run that started before a reconnect can never undo it.

### Worker
The long-running background process that starts syncs on the schedule, catches up after the machine sleeps, and runs a sync when asked. It writes a heartbeat that shows whether background syncing is alive.

### Sync request
A short-lived ask for the worker to run a sync now, made from the app's Sync now control or by connecting X. The worker takes it only when no run is in progress, and drops it once it is too old to still reflect what the owner wanted.

### Run lock
The marker that one whole sync, from X through categorize, is in progress, whether the worker, the CLI or the standalone categorize command started it. It names the owning process and the machine's boot, so a lock left by a crash, or by a process before a reboot, never blocks the next run.

## Categories

### Category focus
The owner's choice of which areas start visible: show everything, or only show areas that match a free-text focus they wrote. Claude judges each newly created area against the focus, using the areas the owner already showed or hid by hand as examples. Areas the owner hid or unhid by hand keep the state they set. Changing the focus re-sorts existing areas only when the owner agrees after seeing a preview.
