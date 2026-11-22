#!/usr/bin/env bash
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
skills="$HOME/.claude/skills"
target="$skills/magpie"

mkdir -p "$skills"

if [ -L "$target" ]; then
  if [ "$target" -ef "$src" ]; then
    echo "magpie skill already linked: $target -> $src"
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
  echo "Moved the existing skill to $backup"
  if [ -e "$backup/secrets.env" ]; then
    echo "Left secrets.env untouched in $backup"
  fi
fi

ln -s "$src" "$target"
echo "Linked $target -> $src"
