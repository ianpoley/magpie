#!/usr/bin/env bash
# Installs this directory as the magpie skill by symlinking it into
# ~/.claude/skills. A skill directory already there is moved to a dated backup
# under ~/.claude/skill-backups.
# Safe to run again.
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
skills="$HOME/.claude/skills"
target="$skills/magpie"

mkdir -p "$skills"

# Before the rename the skill was linked as x-corpus. A link from then that
# points at this clone would load the same skill twice, so it goes.
legacy="$skills/x-corpus"
if [ -L "$legacy" ] && [ "$legacy" -ef "$src" ]; then
  rm "$legacy"
  echo "Removed the old link $legacy"
fi

if [ -L "$target" ]; then
  if [ "$target" -ef "$src" ]; then
    echo "magpie skill already linked: $target -> $src"
    exit 0
  fi
  rm "$target"
elif [ -e "$target" ]; then
  # Outside the skills directory: a backup left there would load as a second skill.
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
