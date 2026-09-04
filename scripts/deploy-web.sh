#!/usr/bin/env bash
set -Eeuo pipefail

readonly NODE_HOME=/home/claude/.nvm/versions/node/v22.13.0
readonly NODE_BIN="$NODE_HOME/bin"
readonly LOCK_FILE=/tmp/chinese-learn-web-deploy.lock
readonly CACHE_LOCK_FILE=/tmp/chinese-learn-web-dependency-cache.lock
readonly DEPENDENCY_CACHE_ROOT=/home/claude/.cache/chinese-learn-web-dependencies

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
WORKTREE_DIR=""
WORKTREE_PARENT=""
OUTPUT_PARENT=""
BUILD_OUTPUT=""
DISPLACED_OUTPUT=""
CACHE_STAGING=""

log() {
  printf '[deploy-web] %s\n' "$*"
}

cleanup() {
  local exit_code=$?

  if [[ -n "$WORKTREE_DIR" && -d "$WORKTREE_DIR" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || \
      rm -rf -- "$WORKTREE_DIR"
  fi
  git -C "$REPO_ROOT" worktree prune >/dev/null 2>&1 || true

  if [[ -n "$WORKTREE_PARENT" && -d "$WORKTREE_PARENT" ]]; then
    rm -rf -- "$WORKTREE_PARENT"
  fi

  if [[ -n "$OUTPUT_PARENT" && -d "$OUTPUT_PARENT" ]]; then
    rm -rf -- "$OUTPUT_PARENT"
  fi

  if [[ -n "$CACHE_STAGING" && -d "$CACHE_STAGING" ]]; then
    rm -rf -- "$CACHE_STAGING"
  fi

  if (( exit_code != 0 )); then
    log "Deployment failed."
  fi
}
trap cleanup EXIT

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another deployment is already running."
  exit 1
fi

if [[ ! -x "$NODE_BIN/node" || ! -x "$NODE_BIN/npm" ]]; then
  log "Required Node installation is missing: $NODE_HOME"
  exit 1
fi
export PATH="$NODE_BIN:$PATH"

if [[ "$(node --version)" != v22.13.0 ]]; then
  log "Node 22.13.0 is mandatory; found $(node --version)."
  exit 1
fi

cd "$REPO_ROOT"
log "Fetching origin/master."
git fetch --prune origin master

WORKTREE_PARENT=$(mktemp -d /tmp/chinese-learn-worktree.XXXXXX)
WORKTREE_DIR="$WORKTREE_PARENT/checkout"
OUTPUT_PARENT=$(mktemp -d "$REPO_ROOT/.deploy-output.XXXXXX")
BUILD_OUTPUT="$OUTPUT_PARENT/dist"

log "Creating a temporary worktree from origin/master."
git worktree add --detach "$WORKTREE_DIR" origin/master

mkdir -p -- "$DEPENDENCY_CACHE_ROOT"
exec 8>"$CACHE_LOCK_FILE"
flock 8

PACKAGE_LOCK_HASH=$(sha256sum "$WORKTREE_DIR/package-lock.json" | awk '{print $1}')
DEPENDENCY_CACHE="$DEPENDENCY_CACHE_ROOT/$PACKAGE_LOCK_HASH"

if [[ -d "$DEPENDENCY_CACHE/node_modules" && \
      -f "$DEPENDENCY_CACHE/complete" && \
      "$(<"$DEPENDENCY_CACHE/complete")" == "$PACKAGE_LOCK_HASH" ]]; then
  log "Restoring dependencies from cache $PACKAGE_LOCK_HASH."
  if ! cp -a --reflink=auto "$DEPENDENCY_CACHE/node_modules" "$WORKTREE_DIR/"; then
    log "Cached dependencies could not be restored; rebuilding them."
    rm -rf -- "$WORKTREE_DIR/node_modules" "$DEPENDENCY_CACHE"
  fi
else
  if [[ -e "$DEPENDENCY_CACHE" ]]; then
    log "Removing incomplete dependency cache $PACKAGE_LOCK_HASH."
    rm -rf -- "$DEPENDENCY_CACHE"
  fi
fi

if [[ ! -d "$WORKTREE_DIR/node_modules" ]]; then
  log "Dependency cache miss; installing with Node $(node --version)."
  npm --prefix "$WORKTREE_DIR" ci

  CACHE_STAGING=$(mktemp -d "$DEPENDENCY_CACHE_ROOT/.${PACKAGE_LOCK_HASH}.XXXXXX")
  cp -a --reflink=auto "$WORKTREE_DIR/node_modules" "$CACHE_STAGING/node_modules"
  printf '%s\n' "$PACKAGE_LOCK_HASH" > "$CACHE_STAGING/complete"
  mv -- "$CACHE_STAGING" "$DEPENDENCY_CACHE"
  CACHE_STAGING=""
  log "Published dependency cache $PACKAGE_LOCK_HASH."
fi

flock -u 8

log "Building into a temporary output directory."
npm --prefix "$WORKTREE_DIR" run build:web -- --output-dir "$BUILD_OUTPUT"

log "Verifying index.html and its referenced assets."
node - "$BUILD_OUTPUT" <<'NODE'
const fs = require('fs');
const path = require('path');

const outputRoot = path.resolve(process.argv[2]);
const indexPath = path.join(outputRoot, 'index.html');
if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile() || fs.statSync(indexPath).size === 0) {
  throw new Error(`Missing or empty ${indexPath}`);
}

const html = fs.readFileSync(indexPath, 'utf8');
const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
  .map((match) => match[1])
  .filter((reference) =>
    !reference.startsWith('#') &&
    !reference.startsWith('data:') &&
    !reference.startsWith('blob:') &&
    !reference.startsWith('//') &&
    !/^[a-z][a-z\d+.-]*:/i.test(reference)
  );

if (references.length === 0) {
  throw new Error('index.html does not reference any local assets');
}

for (const reference of references) {
  const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  const assetPath = path.resolve(outputRoot, pathname.replace(/^\/+/, ''));
  if (assetPath !== outputRoot && !assetPath.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`Asset reference escapes the output directory: ${reference}`);
  }
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile() || fs.statSync(assetPath).size === 0) {
    throw new Error(`Missing or empty referenced asset: ${reference}`);
  }
}

console.log(`Validated index.html and ${references.length} local asset reference(s).`);
NODE

log "Swapping the validated output into dist."
if [[ -e "$REPO_ROOT/dist" ]]; then
  DISPLACED_OUTPUT="$OUTPUT_PARENT/displaced-dist"
  mv -- "$REPO_ROOT/dist" "$DISPLACED_OUTPUT"
fi

if ! mv -- "$BUILD_OUTPUT" "$REPO_ROOT/dist"; then
  if [[ -n "$DISPLACED_OUTPUT" && -e "$DISPLACED_OUTPUT" ]]; then
    mv -- "$DISPLACED_OUTPUT" "$REPO_ROOT/dist"
  fi
  exit 1
fi
check_url() {
  local url=$1
  log "Checking $url"
  curl --fail --silent --show-error --location \
    --retry 4 --retry-delay 2 --retry-all-errors \
    --max-time 20 --output /dev/null "$url"
}

if ! check_url http://127.0.0.1:8081 || ! check_url https://zh.x.bormisov.com; then
  log "Health check failed; restoring the previous output."
  FAILED_OUTPUT="$OUTPUT_PARENT/failed-dist"
  mv -- "$REPO_ROOT/dist" "$FAILED_OUTPUT"
  if [[ -n "$DISPLACED_OUTPUT" && -e "$DISPLACED_OUTPUT" ]]; then
    mv -- "$DISPLACED_OUTPUT" "$REPO_ROOT/dist"
  fi
  exit 1
fi

if [[ -n "$DISPLACED_OUTPUT" && -e "$DISPLACED_OUTPUT" ]]; then
  rm -rf -- "$DISPLACED_OUTPUT"
fi

log "Deployment completed successfully; the serving process keeps running."
