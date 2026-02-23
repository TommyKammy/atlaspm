# Baseline CI + E2E (Upgrade Prerequisite)

Run these commands from repo root on every upgrade PR:

1. `pnpm install`
2. `pnpm -r --if-present lint`
3. `pnpm -r --if-present typecheck`
4. `pnpm -r --if-present test`
5. `pnpm -r --if-present build`
6. `pnpm e2e`

Notes:
- E2E entrypoint is `pnpm e2e` (`./scripts/run-e2e.sh`), which starts compose services, runs Playwright, and tears down.
- If Docker images must be rebuilt after dependency changes, run `pnpm e2e:rebuild`.
