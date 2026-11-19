# Birdclaw → local X corpus — one-time setup

Everything Claude built lives in this folder
(`~/x-corpus`). The nightly job and Birdclaw itself run on
**your Mac** — Claude runs in the cloud and can't install Homebrew or log into
X for you, so these steps are yours to run once. After that it's automatic.

## 1. Install Birdclaw + a login transport

```bash
brew install steipete/tap/birdclaw
birdclaw --version
birdclaw init                 # creates ~/.birdclaw/birdclaw.sqlite
```

Bookmarks and likes need a live login. The easiest path is the **bird**
transport, which reuses the X session already in your browser — no developer
app, no API keys:

```bash
npm install -g @steipete/bird
bird whoami                    # should print @ianpoley
```

(Alternative: the official `xurl` transport with your own X developer app —
`xurl auth oauth2 --app my-app` then `xurl whoami`. Only needed if you'd rather
not use browser cookies. See https://birdclaw.sh/auth.html )

Confirm auth is good:

```bash
birdclaw auth status --json
```

## 2. First full backfill (once)

The nightly job runs *incrementally*. Pull your full history one time first:

```bash
birdclaw sync bookmarks --mode auto --all --refresh --json
birdclaw sync likes     --mode auto --all --refresh --json
```

## 3. Prove the export works by hand

```bash
bash ~/x-corpus/packages/engine/bin/birdclaw-nightly.sh
tail -n 40 ~/x-corpus/logs/nightly-*.log
```

You should now see `data/bookmarks.json`, `data/likes.json`, and Markdown under
`markdown/bookmarks/` and `markdown/likes/`. Running by hand once also clears any
first-time macOS Keychain prompt that `bird` needs to read browser cookies —
important, because the midnight run happens with no one at the keyboard.

> If the Markdown looks thin (missing text or handles), open one file in
> `data/*.json`, check the field names, and tell Claude — the converter
> (`packages/engine/bin/build-markdown.mjs`) is written to be adjusted in one spot. The log
> prints "Fields seen on first record: …" to make that quick.

## 4. Schedule it at midnight (launchd)

```bash
cp ~/x-corpus/packages/engine/launchd/com.ianpoley.birdclaw-nightly.plist \
   ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.ianpoley.birdclaw-nightly.plist 2>/dev/null
launchctl load   ~/Library/LaunchAgents/com.ianpoley.birdclaw-nightly.plist
launchctl list | grep birdclaw          # confirm it's registered
```

To run the scheduled job on demand (test it end to end):

```bash
launchctl start com.ianpoley.birdclaw-nightly
```

To stop scheduling later:

```bash
launchctl unload ~/Library/LaunchAgents/com.ianpoley.birdclaw-nightly.plist
```

### Notes
- The Mac must be awake at 00:00. If it's asleep, launchd runs the job once on
  the next wake — so you won't silently skip a day, but the timestamp drifts.
- Logs: per-day run logs in `logs/nightly-YYYYMMDD.log`; launchd's own stdout/err
  in `logs/launchd.out.log` / `logs/launchd.err.log`.
- Birdclaw also ships its own scheduler (`birdclaw jobs install-bookmarks-launchd`,
  every 3h). We use our own plist instead so it's exactly midnight, covers likes
  too, and writes the JSON+Markdown export into this folder.
