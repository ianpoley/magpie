#!/usr/bin/env bash
# Installs this directory as the x-corpus skill by symlinking it into
# ~/.claude/skills. A skill directory already there is moved to a dated backup.
# Safe to run again.
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
skills="$HOME/.claude/skills"
target="$skills/x-corpus"

mkdir -p "$skills"

if [ -L "$target" ]; then
  if [ "$target" -ef "$src" ]; then
    echo "x-corpus skill already linked: $target -> $src"
    exit 0
  fi
  rm "$target"
elif [ -e "$target" ]; then
  backup="$skills/x-corpus.backup-$(date +%Y-%m-%d)"
  if [ -e "$backup" ] || [ -L "$backup" ]; then
    backup="$backup-$(date +%H%M%S)"
  fi
  mv "$target" "$backup"
  echo "Moved the existing skill to $backup"
  if [ -e "$backup/secrets.env" ]; then
    echo "Left secrets.env untouched in $backup"
  fi
fi

ln -s "$src" "$target"
echo "Linked $target -> $src"
