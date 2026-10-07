#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building iOS app on EAS..."
npx eas-cli@latest build \
  --platform ios \
  --profile production \
  --wait

echo "==> Submitting latest iOS build to TestFlight..."
npx eas-cli@latest submit \
  --platform ios \
  --profile production \
  --latest \
  --wait

echo "==> Done. Wait for Apple's processing, then open TestFlight."
