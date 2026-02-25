#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUNS="${E2E_STABILITY_RUNS:-3}"
if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || [[ "$RUNS" -lt 1 ]]; then
  echo "E2E_STABILITY_RUNS must be a positive integer" >&2
  exit 1
fi

for ((i=1; i<=RUNS; i++)); do
  echo "=== E2E stability run $i/$RUNS ==="
  pnpm e2e
done
