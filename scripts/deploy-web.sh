#!/usr/bin/env bash
set -Eeuo pipefail

readonly NODE_HOME=/home/claude/.nvm/versions/node/v22.13.0
readonly NODE_BIN="$NODE_HOME/bin"
readonly LOCK_FILE=/tmp/chinese-learn-web-deploy.lock
readonly CACHE_LOCK_FILE=/tmp/chinese-learn-web-dependency-cache.lock
readonly DEPENDENCY_CACHE_ROOT=/home/claude/.cache/chinese-learn-web-dependencies
readonly BRANCH_DEPLOYMENT_ROOT=/home/claude/chinese-learn-web-deployments
readonly ACME_WEBROOT=/var/www/certbot
readonly NGINX_SITES_AVAILABLE=/etc/nginx/sites-available
readonly NGINX_SITES_ENABLED=/etc/nginx/sites-enabled
readonly NGINX_BRANCH_HASH_CONFIG=/etc/nginx/conf.d/chinese-learn-branch-hosts.conf

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
CURRENT_BRANCH=$(git -C "$REPO_ROOT" symbolic-ref --quiet --short HEAD) || {
  printf '[deploy-web] Deployments require a named branch, not detached HEAD.\n' >&2
  exit 1
}
DEPLOY_SLUG=$(printf '%s' "$CURRENT_BRANCH" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
if [[ -z "$DEPLOY_SLUG" || ${#DEPLOY_SLUG} -gt 63 ]]; then
  printf '[deploy-web] Branch name does not produce a valid DNS label: %s\n' "$CURRENT_BRANCH" >&2
  exit 1
fi
if [[ "$CURRENT_BRANCH" == master ]]; then
  DEPLOY_HOST=zh.x.bormisov.com
  DEPLOY_TARGET="$REPO_ROOT/dist"
else
  DEPLOY_HOST="$DEPLOY_SLUG.zh.x.bormisov.com"
  DEPLOY_TARGET="$BRANCH_DEPLOYMENT_ROOT/$DEPLOY_SLUG"
fi
WORKTREE_DIR=""
WORKTREE_PARENT=""
OUTPUT_PARENT=""
BUILD_OUTPUT=""
DISPLACED_OUTPUT=""
CACHE_STAGING=""
DEPLOYMENT_SWAPPED=0

log() {
  printf '[deploy-web] %s\n' "$*"
}

cleanup() {
  local exit_code=$?

  if (( exit_code != 0 && DEPLOYMENT_SWAPPED == 1 )); then
    if [[ -e "$DEPLOY_TARGET" ]]; then
      mv -- "$DEPLOY_TARGET" "$OUTPUT_PARENT/failed-dist" 2>/dev/null || true
    fi
    if [[ -n "$DISPLACED_OUTPUT" && -e "$DISPLACED_OUTPUT" ]]; then
      mv -- "$DISPLACED_OUTPUT" "$DEPLOY_TARGET" 2>/dev/null || true
    fi
  fi

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
if ! flock -w 1800 9; then
  log "Timed out waiting for another deployment."
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
DEPLOY_COMMIT=$(git rev-parse HEAD)
log "Deploying $CURRENT_BRANCH at $DEPLOY_COMMIT to https://$DEPLOY_HOST."

WORKTREE_PARENT=$(mktemp -d /tmp/chinese-learn-worktree.XXXXXX)
WORKTREE_DIR="$WORKTREE_PARENT/checkout"
if [[ "$CURRENT_BRANCH" == master ]]; then
  OUTPUT_ROOT="$REPO_ROOT"
else
  mkdir -p -- "$BRANCH_DEPLOYMENT_ROOT"
  OUTPUT_ROOT="$BRANCH_DEPLOYMENT_ROOT"
fi
OUTPUT_PARENT=$(mktemp -d "$OUTPUT_ROOT/.deploy-output.$DEPLOY_SLUG.XXXXXX")
BUILD_OUTPUT="$OUTPUT_PARENT/dist"

log "Creating a temporary worktree from committed HEAD."
git worktree add --detach "$WORKTREE_DIR" "$DEPLOY_COMMIT"

exec 8>"$CACHE_LOCK_FILE"
flock 8
mkdir -p -- "$DEPENDENCY_CACHE_ROOT"

PACKAGE_LOCK_HASH=$(sha256sum "$WORKTREE_DIR/frontend/package-lock.json" | awk '{print $1}')
DEPENDENCY_CACHE="$DEPENDENCY_CACHE_ROOT/$PACKAGE_LOCK_HASH"

if [[ -d "$DEPENDENCY_CACHE/node_modules" && \
      -f "$DEPENDENCY_CACHE/complete" && \
      "$(<"$DEPENDENCY_CACHE/complete")" == "$PACKAGE_LOCK_HASH" ]]; then
  log "Restoring dependencies from cache $PACKAGE_LOCK_HASH."
  if ! cp -a --reflink=auto "$DEPENDENCY_CACHE/node_modules" "$WORKTREE_DIR/frontend/"; then
    log "Cached dependencies could not be restored; rebuilding them."
    rm -rf -- "$WORKTREE_DIR/frontend/node_modules" "$DEPENDENCY_CACHE"
  fi
else
  if [[ -e "$DEPENDENCY_CACHE" ]]; then
    log "Removing incomplete dependency cache $PACKAGE_LOCK_HASH."
    rm -rf -- "$DEPENDENCY_CACHE"
  fi
fi

if [[ ! -d "$WORKTREE_DIR/frontend/node_modules" ]]; then
  log "Dependency cache miss; installing with Node $(node --version)."
  npm --prefix "$WORKTREE_DIR/frontend" ci

  CACHE_STAGING=$(mktemp -d "$DEPENDENCY_CACHE_ROOT/.${PACKAGE_LOCK_HASH}.XXXXXX")
  cp -a --reflink=auto "$WORKTREE_DIR/frontend/node_modules" "$CACHE_STAGING/node_modules"
  printf '%s\n' "$PACKAGE_LOCK_HASH" > "$CACHE_STAGING/complete"
  mv -- "$CACHE_STAGING" "$DEPENDENCY_CACHE"
  CACHE_STAGING=""
  log "Published dependency cache $PACKAGE_LOCK_HASH."
fi

flock -u 8

log "Building into a temporary output directory."
npm --prefix "$WORKTREE_DIR/frontend" run build:web -- --output-dir "$BUILD_OUTPUT"

log "Publishing the backend architecture document."
install -D -m 0644 \
  "$WORKTREE_DIR/backend/docs/backend-architecture.html" \
  "$BUILD_OUTPUT/docs/backend-architecture.html"
install -D -m 0644 \
  "$WORKTREE_DIR/backend/docs/backend-architecture.html" \
  "$BUILD_OUTPUT/docs/backend-architecture.htm"
install -D -m 0644 \
  "$WORKTREE_DIR/backend/docs/backend-architecture.html" \
  "$BUILD_OUTPUT/docs/backend-architecture/index.html"

# Nginx serves the atomic output directly; make every published directory and
# file traversable/readable by the web server regardless of mktemp defaults.
chmod -R a+rX "$BUILD_OUTPUT"

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

log "Swapping the validated output into $DEPLOY_TARGET."
if [[ -e "$DEPLOY_TARGET" ]]; then
  DISPLACED_OUTPUT="$OUTPUT_PARENT/displaced-dist"
  mv -- "$DEPLOY_TARGET" "$DISPLACED_OUTPUT"
fi

if ! mv -- "$BUILD_OUTPUT" "$DEPLOY_TARGET"; then
  if [[ -n "$DISPLACED_OUTPUT" && -e "$DISPLACED_OUTPUT" ]]; then
    mv -- "$DISPLACED_OUTPUT" "$DEPLOY_TARGET"
  fi
  exit 1
fi
DEPLOYMENT_SWAPPED=1

provision_branch_host() {
  local config_path="$NGINX_SITES_AVAILABLE/chinese-learn-$DEPLOY_SLUG"
  local config_staging
  config_staging=$(mktemp)

  # Branch names can make hostnames longer than Nginx's default hash bucket.
  # The VPS includes conf.d inside its http block.
  printf 'server_names_hash_bucket_size 128;\nserver_names_hash_max_size 2048;\n' >"$config_staging"
  sudo install -m 0644 "$config_staging" "$NGINX_BRANCH_HASH_CONFIG"

  if ! sudo test -s "/etc/letsencrypt/live/$DEPLOY_HOST/fullchain.pem"; then
    log "Obtaining the initial Let's Encrypt certificate for $DEPLOY_HOST."
    sudo certbot certonly --webroot --webroot-path "$ACME_WEBROOT" \
      --cert-name "$DEPLOY_HOST" --domains "$DEPLOY_HOST" \
      --non-interactive --agree-tos --no-eff-email
  fi

  if [[ "$CURRENT_BRANCH" == dev ]]; then
    cat >"$config_staging" <<NGINX
server {
    listen 8443 ssl http2 proxy_protocol;
    server_name $DEPLOY_HOST;

    set_real_ip_from 127.0.0.1;
    real_ip_header proxy_protocol;

    ssl_certificate /etc/letsencrypt/live/$DEPLOY_HOST/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DEPLOY_HOST/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root $DEPLOY_TARGET;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8787/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:8787/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
  else
    cat >"$config_staging" <<NGINX
server {
    listen 8443 ssl http2 proxy_protocol;
    server_name $DEPLOY_HOST;

    set_real_ip_from 127.0.0.1;
    real_ip_header proxy_protocol;

    ssl_certificate /etc/letsencrypt/live/$DEPLOY_HOST/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DEPLOY_HOST/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root $DEPLOY_TARGET;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
  fi
  sudo install -m 0644 "$config_staging" "$config_path"
  rm -f -- "$config_staging"
  sudo ln -sfn "$config_path" "$NGINX_SITES_ENABLED/chinese-learn-$DEPLOY_SLUG"
  sudo nginx -t
  sudo systemctl reload nginx
}

if [[ "$CURRENT_BRANCH" != master ]]; then
  provision_branch_host
fi

check_url() {
  local url=$1
  log "Checking $url"
  curl --fail --silent --show-error --location \
    --retry 4 --retry-delay 2 --retry-all-errors \
    --max-time 20 --output /dev/null "$url"
}

if [[ "$CURRENT_BRANCH" == master ]]; then
  LOCAL_URL=http://127.0.0.1:8081
else
  LOCAL_URL="https://$DEPLOY_HOST"
fi

if ! check_url "$LOCAL_URL" || ! check_url "https://$DEPLOY_HOST"; then
  log "Health check failed; restoring the previous output."
  exit 1
fi

if [[ -n "$DISPLACED_OUTPUT" && -e "$DISPLACED_OUTPUT" ]]; then
  rm -rf -- "$DISPLACED_OUTPUT"
fi
DEPLOYMENT_SWAPPED=0

log "Deployment completed successfully: https://$DEPLOY_HOST"
