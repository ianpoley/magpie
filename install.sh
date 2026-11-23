#!/usr/bin/env bash
set -euo pipefail

main() {
  paint_setup
  printf '%s  %s\n' "$(dim '┌')" "$(bold 'Magpie installer')"
  local repo="${MAGPIE_REPO:-https://github.com/ianpoley/magpie.git}"
  local dir="${MAGPIE_DIR:-$HOME/magpie}"

  case "$(uname -s)" in
    Darwin | Linux) ;;
    *) fail "Magpie runs on macOS or Linux only." ;;
  esac

  command -v git >/dev/null 2>&1 ||
    fail "git is missing. On macOS run: xcode-select --install. On Linux, install git with your package manager."

  if ! command -v bun >/dev/null 2>&1; then
    if [ ! -x "$HOME/.bun/bin/bun" ]; then
      command -v unzip >/dev/null 2>&1 ||
        fail "unzip is missing, and the Bun installer needs it. Install it (Debian or Ubuntu: sudo apt install unzip; Fedora: sudo dnf install unzip), then run this again."
      say "Installing Bun into ~/.bun (https://bun.sh)"
      curl -fsSL https://bun.sh/install | bash
    fi
    export PATH="$HOME/.bun/bin:$PATH"
  fi

  if [ -d "$dir/.git" ]; then
    is_magpie_clone "$dir" ||
      fail "$(tilde "$dir") is a git repository but not Magpie. Set MAGPIE_DIR to another folder."
    say "Updating Magpie in $(tilde "$dir")"
    git -C "$dir" pull --ff-only --quiet
  elif [ -e "$dir" ]; then
    fail "$(tilde "$dir") already exists and is not a Magpie clone. Set MAGPIE_DIR to another folder."
  else
    say "Downloading Magpie into $(tilde "$dir")"
    git clone --quiet "$repo" "$dir"
  fi

  cd "$dir"
  local status=0
  if (exec </dev/tty) 2>/dev/null; then
    hand_over "Starting setup"
    bun run setup "$@" </dev/tty || status=$?
  else
    hand_over "No terminal attached, so setup runs without questions"
    bun run setup --yes "$@" || status=$?
  fi

  bun_path_hint
  exit "$status"
}

bun_path_hint() {
  [ "$(command -v bun)" = "$HOME/.bun/bin/bun" ] || return 0
  grep -qsE '\.bun/bin|BUN_INSTALL' "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile" "$HOME/.zshrc" "$HOME/.config/fish/config.fish" && return 0
  printf '\n%s  %s\n' "$(yellow '▲')" "$(bold 'Add Bun to your PATH so new terminals can run bun')"
  printf '%s  Add these two lines to ~/.zshrc or ~/.bashrc, then open a new terminal:\n' "$(dim '│')"
  printf '%s\n' "$(dim '│')"
  printf '%s    %s\n' "$(dim '│')" "$(cyan 'export BUN_INSTALL="$HOME/.bun"')"
  printf '%s    %s\n' "$(dim '│')" "$(cyan 'export PATH="$BUN_INSTALL/bin:$PATH"')"
  printf '%s\n' "$(dim '└')"
}

is_magpie_clone() {
  [ -f "$1/packages/engine/bin/setup.mjs" ] && grep -q '"name": "magpie"' "$1/package.json" 2>/dev/null
}

paint_setup() {
  COLOR=0
  if [ -z "${NO_COLOR:-}" ] && { [ "${FORCE_COLOR:-0}" != 0 ] || { [ -t 1 ] && [ "${TERM:-}" != dumb ]; }; }; then
    COLOR=1
  fi
}

paint() {
  if [ "$COLOR" = 1 ]; then printf '\033[%sm%s\033[%sm' "$1" "$2" "$3"; else printf '%s' "$2"; fi
}

bold() { paint 1 "$1" 22; }
dim() { paint 2 "$1" 22; }
red() { paint 31 "$1" 39; }
yellow() { paint 33 "$1" 39; }
cyan() { paint 36 "$1" 39; }

tilde() {
  case "$1" in
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *) printf '%s' "$1" ;;
  esac
}

say() {
  printf '%s\n%s  %s\n' "$(dim '│')" "$(cyan '◇')" "$(bold "$*")"
}

hand_over() {
  printf '%s\n%s  %s\n\n' "$(dim '│')" "$(dim '└')" "$*"
}

fail() {
  if [ ! -t 2 ] && [ "${FORCE_COLOR:-0}" = 0 ]; then COLOR=0; fi
  printf '%s\n%s  %s\n' "$(dim '│')" "$(red '✗')" "$(red "$*")" >&2
  printf '%s  %s\n' "$(dim '└')" "Fix that, then run the installer again." >&2
  exit 1
}

main "$@"
