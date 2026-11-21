#!/usr/bin/env bash
set -uo pipefail

CORPUS_DIR="/Users/ianpoley/x-corpus"
ENGINE_DIR="$CORPUS_DIR/packages/engine"
DATA_DIR="$CORPUS_DIR/data"
MD_DIR="$CORPUS_DIR/markdown"
LOG_DIR="$CORPUS_DIR/logs"
LIMIT=100000
MAX_PAGES=50

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

BIRD_ENV="$HOME/.birdclaw/bird.env"
# shellcheck source=/dev/null
[ -f "$BIRD_ENV" ] && . "$BIRD_ENV"

mkdir -p "$DATA_DIR" "$MD_DIR/bookmarks" "$MD_DIR/likes" "$LOG_DIR"

LOG="$LOG_DIR/nightly-$(date +%Y%m%d).log"
exec >>"$LOG" 2>&1
ts() { date "+%Y-%m-%dT%H:%M:%S%z"; }
echo "===================================================="
echo "birdclaw nightly run  $(ts)"

if ! command -v bird >/dev/null 2>&1; then
  BIRD_DIR="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | while read -r d; do [ -x "$d/bird" ] && echo "$d"; done | tail -1)"
  if [ -n "$BIRD_DIR" ]; then export PATH="$BIRD_DIR:$PATH"; fi
fi

if ! command -v birdclaw >/dev/null 2>&1; then
  echo "ERROR: 'birdclaw' not found on PATH. Is it installed (brew install steipete/tap/birdclaw)?"
  exit 127
fi

if ! command -v bird >/dev/null 2>&1; then
  echo "ERROR: 'bird' not found on PATH or under ~/.nvm. Install it: npm install -g @steipete/bird@0.8.0"
  exit 127
fi


echo "[sync] bookmarks ..."
birdclaw sync bookmarks --mode bird --limit "$LIMIT" --max-pages "$MAX_PAGES" --early-stop --refresh --json
BOOKMARKS_EXIT=$?; BOOKMARKS_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[ "$BOOKMARKS_EXIT" -eq 0 ] || echo "WARN: bookmark sync returned nonzero (continuing with cached data)"
echo "[sync] likes ..."
birdclaw sync likes --mode bird --limit "$LIMIT" --max-pages "$MAX_PAGES" --early-stop --refresh --json
LIKES_EXIT=$?; LIKES_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[ "$LIKES_EXIT" -eq 0 ] || echo "WARN: likes sync returned nonzero (continuing with cached data)"

printf '{"bookmarks":{"exit":%d,"at":"%s"},"likes":{"exit":%d,"at":"%s"}}\n' \
  "$BOOKMARKS_EXIT" "$BOOKMARKS_AT" "$LIKES_EXIT" "$LIKES_AT" > "$DATA_DIR/sync-status.json.tmp" \
  && mv "$DATA_DIR/sync-status.json.tmp" "$DATA_DIR/sync-status.json"

echo "[export] json ..."
if birdclaw search tweets --bookmarked --limit "$LIMIT" --json > "$DATA_DIR/bookmarks.json.tmp"; then
  mv "$DATA_DIR/bookmarks.json.tmp" "$DATA_DIR/bookmarks.json"
else
  echo "WARN: bookmark export failed; keeping previous data/bookmarks.json"; rm -f "$DATA_DIR/bookmarks.json.tmp"
fi
if birdclaw search tweets --liked --limit "$LIMIT" --json > "$DATA_DIR/likes.json.tmp"; then
  mv "$DATA_DIR/likes.json.tmp" "$DATA_DIR/likes.json"
else
  echo "WARN: likes export failed; keeping previous data/likes.json"; rm -f "$DATA_DIR/likes.json.tmp"
fi

echo "[markdown] build ..."
[ -f "$DATA_DIR/bookmarks.json" ] && node "$ENGINE_DIR/bin/build-markdown.mjs" \
  "$DATA_DIR/bookmarks.json" "$MD_DIR/bookmarks" bookmark "$DATA_DIR/bookmarks.normalized.jsonl"
[ -f "$DATA_DIR/likes.json" ] && node "$ENGINE_DIR/bin/build-markdown.mjs" \
  "$DATA_DIR/likes.json" "$MD_DIR/likes" like "$DATA_DIR/likes.normalized.jsonl"

echo "[categorize] ..."
node "$ENGINE_DIR/bin/categorize.mjs" \
  || echo "WARN: categorize returned nonzero (export and markdown are unaffected)"

echo "[done] $(ts)"
