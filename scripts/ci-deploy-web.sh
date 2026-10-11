#!/usr/bin/env bash
set -Eeuo pipefail

# Installed as the forced command for the GitHub Actions deployment key.
# The workflow supplies "deploy BRANCH COMMIT" as SSH_ORIGINAL_COMMAND.
read -r action branch requested_commit extra <<< "${SSH_ORIGINAL_COMMAND:-}"
if [[ "$action" != deploy || -z "${branch:-}" || -z "${requested_commit:-}" || -n "${extra:-}" ]]; then
  printf 'Expected: deploy BRANCH COMMIT\n' >&2
  exit 2
fi
if [[ ! "$branch" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] ||
   ! git check-ref-format "refs/heads/$branch" ||
   [[ ! "$requested_commit" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Invalid branch or commit.\n' >&2
  exit 2
fi

repo=/home/claude/chinese-learn/dev
root=/home/claude/chinese-learn
slug=$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
if [[ -z "$slug" || ${#slug} -gt 63 ]]; then
  printf 'Branch does not produce a valid deployment host.\n' >&2
  exit 2
fi

# Serialize Git operations across all branch worktrees. The build script has
# its own deployment lock, shared with manual deployments.
exec 9>/tmp/chinese-learn-ci-git.lock
flock -w 1800 9

export GIT_TERMINAL_PROMPT=0
git -C "$repo" fetch --no-tags origin \
  "refs/heads/$branch:refs/remotes/origin/$branch"
remote_commit=$(git -C "$repo" rev-parse "refs/remotes/origin/$branch")
if [[ "$remote_commit" != "$requested_commit" ]]; then
  printf 'Skipping superseded push to %s: requested %s, current %s.\n' \
    "$branch" "$requested_commit" "$remote_commit"
  exit 0
fi

case "$branch" in
  dev) worktree=$root/dev ;;
  master) worktree=$root/app ;;
  *) worktree=$root/branch-worktrees/$slug ;;
esac

if [[ ! -e "$worktree" ]]; then
  mkdir -p "$root/branch-worktrees"
  if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$repo" worktree add "$worktree" "$branch"
  else
    git -C "$repo" worktree add -b "$branch" "$worktree" "$requested_commit"
  fi
fi

actual_branch=$(git -C "$worktree" symbolic-ref --quiet --short HEAD)
if [[ "$actual_branch" != "$branch" || -n "$(git -C "$worktree" status --porcelain)" ]]; then
  printf 'Deployment worktree is on the wrong branch or has local changes: %s\n' "$worktree" >&2
  exit 1
fi

if [[ "$branch" == dev || "$branch" == master ]]; then
  git -C "$worktree" merge --ff-only "$requested_commit"
else
  # Preview branches may be rebased. Their dedicated worktrees contain no
  # user data, so reset to the exact pushed commit after confirming the ref.
  git -C "$worktree" reset --hard "$requested_commit"
fi

printf 'Deploying %s at %s from %s.\n' "$branch" "$requested_commit" "$worktree"
bash "$worktree/scripts/deploy-web.sh"
