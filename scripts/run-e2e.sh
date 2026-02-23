#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pushd infra/docker >/dev/null
if [[ "${E2E_REBUILD:-0}" == "1" ]]; then
  docker compose build core-api web-ui
fi
docker compose up -d postgres core-api web-ui
popd >/dev/null

cleanup() {
  pushd infra/docker >/dev/null
  if [[ "${E2E_KEEP_UP:-0}" != "1" ]]; then
    docker compose down
  fi
  popd >/dev/null
}
trap cleanup EXIT

pnpm --filter @atlaspm/playwright e2e
