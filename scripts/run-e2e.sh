#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pushd infra/docker >/dev/null
if [[ "${E2E_REBUILD:-0}" == "1" ]]; then
  docker compose build core-api collab-server web-ui
fi
docker compose up -d postgres core-api collab-server web-ui
popd >/dev/null

wait_for_url() {
  local url="$1"
  local name="$2"
  local retries=60
  local sleep_sec=2

  for ((i=1; i<=retries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_sec"
  done

  echo "Timed out waiting for $name at $url" >&2
  return 1
}

wait_for_url "http://localhost:3001/docs" "core-api"
wait_for_url "http://localhost:3000/login" "web-ui"

cleanup() {
  pushd infra/docker >/dev/null
  if [[ "${E2E_KEEP_UP:-0}" != "1" ]]; then
    docker compose down
  fi
  popd >/dev/null
}
trap cleanup EXIT

pnpm --filter @atlaspm/playwright e2e
