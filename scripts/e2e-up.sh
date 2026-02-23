#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pushd infra/docker >/dev/null
docker compose up -d --build postgres core-api collab-server web-ui
popd >/dev/null
