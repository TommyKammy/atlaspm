#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-e2e/playwright/baseline-screenshots}"
mkdir -p "$OUT_DIR"

echo "Manual capture helper"
echo "1) Start stack: pnpm e2e:up"
echo "2) Open http://localhost:3000 and capture:"
echo "   - project-list-light.png"
echo "   - project-list-dark.png"
echo "   - project-list-subtasks-expanded.png"
echo "   - admin-users.png"
echo "3) Save files into: $OUT_DIR"
