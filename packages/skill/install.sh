#!/usr/bin/env bash
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
skills="$HOME/.claude/skills"
target="$skills/magpie"

color=0
if [ -z "${NO_COLOR:-}" ] && { [ "${FORCE_COLOR:-0}" != 0 ] || { [ -t 1 ] && [ "${TERM:-}" != dumb ]; }; }; then
  color=1
fi

mark() {
  if [ "$color" = 1 ]; then printf '\033[32m✓\033[39m'; else printf '✓'; fi
}

tilde() {
  case "$1" in
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *) printf '%s' "$1" ;;
  esac
}

mkdir -p "$skills"

if [ -L "$target" ]; then
  if [ "$target" -ef "$src" ]; then
    echo "$(mark) The magpie skill is already linked: $(tilde "$target") -> $(tilde "$src")"
    exit 0
  fi
  rm "$target"
elif [ -e "$target" ]; then
  mkdir -p "$HOME/.claude/skill-backups"
  backup="$HOME/.claude/skill-backups/magpie-$(date +%Y-%m-%d)"
  if [ -e "$backup" ] || [ -L "$backup" ]; then
    backup="$backup-$(date +%H%M%S)"
  fi
  mv "$target" "$backup"
  echo "Moved the existing skill to $(tilde "$backup")"
  if [ -e "$backup/secrets.env" ]; then
    echo "Left secrets.env untouched in $(tilde "$backup")"
  fi
fi

ln -s "$src" "$target"
echo "$(mark) Linked $(tilde "$target") -> $(tilde "$src")"
