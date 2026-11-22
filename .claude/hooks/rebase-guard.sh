#!/usr/bin/env bash
set -u

command=$(jq -r '.tool_input.command // ""')

if ! grep -qE '(^|[;&|[:space:]])(git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create)([[:space:]]|$)' <<<"$command"; then
  exit 0
fi

dir=$(grep -oE 'git[[:space:]]+-C[[:space:]]+[^[:space:]]+' <<<"$command" | head -1 | awk '{print $3}')
dir=${dir:-${CLAUDE_PROJECT_DIR:-.}}

branch=$(git -C "$dir" branch --show-current 2>/dev/null)
if [ -z "$branch" ] && grep -qE 'HEAD:refs/heads/' <<<"$command"; then
  branch=$(grep -oE 'HEAD:refs/heads/[^[:space:]]+' <<<"$command" | head -1 | sed 's#HEAD:refs/heads/##')
fi
push_args=""
if grep -qE 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push' <<<"$command"; then
  push_args=$(sed -E 's/.*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push//' <<<"$command" | sed -E 's/[;&|].*//')
fi
if [ "$branch" = "main" ] || grep -qE '(^|[[:space:]:])main([[:space:]]|$)' <<<"$push_args"; then
  exit 0
fi

git -C "$dir" fetch --quiet origin main 2>/dev/null || exit 0

merges=$(git -C "$dir" rev-list --merges origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
behind=$(git -C "$dir" rev-list --count HEAD..origin/main 2>/dev/null)

if [ "${merges:-0}" -gt 0 ] || [ "${behind:-0}" -gt 0 ]; then
  {
    echo "Blocked: this branch is not rebased onto origin/main (${behind:-?} commits behind, ${merges:-?} merge commits)."
    echo "This repo merges PRs by rebase only, so GitHub replays each commit onto main. A merge commit does not stop that replay from conflicting."
    echo "Fix: git fetch origin && git rebase origin/main, resolve each commit's conflicts, run the checks, then git push --force-with-lease."
    echo "See CLAUDE.md, 'Pull requests: rebase onto main, never merge it in'."
  } >&2
  exit 2
fi

exit 0
