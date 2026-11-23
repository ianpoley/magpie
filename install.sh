#!/usr/bin/env bash
set -euo pipefail

main() {
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
      fail "$dir is a git repository but not Magpie. Set MAGPIE_DIR to another folder."
    say "Updating Magpie in $dir"
    git -C "$dir" pull --ff-only
  elif [ -e "$dir" ]; then
    fail "$dir already exists and is not a Magpie clone. Set MAGPIE_DIR to another folder."
  else
    say "Downloading Magpie into $dir"
    git clone "$repo" "$dir"
  fi

  cd "$dir"
  local status=0
  if (exec </dev/tty) 2>/dev/null; then
    say "Starting setup"
    bun run setup "$@" </dev/tty || status=$?
  else
    say "No terminal attached: running setup without prompts"
    bun run setup --yes "$@" || status=$?
  fi

  bun_path_hint
  exit "$status"
}

bun_path_hint() {
  [ "$(command -v bun)" = "$HOME/.bun/bin/bun" ] || return 0
  grep -qsE '\.bun/bin|BUN_INSTALL' "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile" "$HOME/.zshrc" "$HOME/.config/fish/config.fish" && return 0
  say "Add Bun to your PATH so new terminals can run bun"
  printf 'Add these two lines to your shell startup file (~/.zshrc or ~/.bashrc), then open a new terminal:\n\n'
  printf '  export BUN_INSTALL="$HOME/.bun"\n'
  printf '  export PATH="$BUN_INSTALL/bin:$PATH"\n'
}

is_magpie_clone() {
  [ -f "$1/packages/engine/bin/setup.mjs" ] && grep -q '"name": "magpie"' "$1/package.json" 2>/dev/null
}

say() {
  printf '\n\033[1m==> %s\033[0m\n' "$*"
}

fail() {
  printf '\nmagpie install: %s\n' "$*" >&2
  exit 1
}

main "$@"
