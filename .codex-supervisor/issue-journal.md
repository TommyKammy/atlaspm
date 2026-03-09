# Issue #313: P0: Remove default dev auth secret fallback and require explicit secret

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/313
- Branch: codex/reopen-issue-313
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-313
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-313/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 4
- Last head SHA: 0ad1af14f7f96517631da288d2db638566b0ec05
- Blocked reason: none
- Last failure signature: e2e:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-09T11:13:51.187Z

## Latest Codex Summary
Applied the review fix on top of PR #318 and pushed `0ad1af1` (`Reject shipped dev auth placeholders`).

The reviewer concern was valid: the example secret was still a repo-shipped known value that passed validation. I fixed that by making the shipped `.env.example` value fail closed (`DEV_AUTH_SECRET=replace-me`), explicitly rejecting shipped placeholder secrets in `DISALLOWED_DEV_AUTH_SECRETS`, and adding a focused env test that covers the placeholder case. I also resolved both bot review threads on the PR.

Local verification passed:
- `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts --reporter=dot`
- `pnpm --filter @atlaspm/domain test`
- `pnpm --filter @atlaspm/core-api test`

GitHub has started a fresh run for PR #318; `lint`, `type-check`, and `test` are currently pending.

Summary: Addressed both review threads by rejecting shipped placeholder secrets, updated the example env to fail closed, added regression coverage, pushed `0ad1af1`, and resolved the threads.
State hint: waiting_ci
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts --reporter=dot`; `pnpm --filter @atlaspm/domain test`; `pnpm --filter @atlaspm/core-api test`
Failure signature: none
Next action: watch the new PR #318 checks on commit `0ad1af1` and confirm they complete successfully

## Active Failure Context
- Category: checks
- Summary: PR #318 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/318
- Details:
  - e2e (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22850428040/job/66277529591

## Codex Working Notes
### Current Handoff
- Hypothesis: The new E2E red is a compose-stack config drift, not a browser regression. `infra/docker/docker-compose.yml` still boots `core-api` with the now-banned `dev-secret-change-me`, so Playwright never gets a healthy API.
- Primary failure or risk: PR #318 `e2e` failed before tests ran because `atlaspm-core-api` exited during startup with `Error: DEV_AUTH_SECRET is too weak. Choose a non-default secret.` from the compose-provided `DEV_AUTH_SECRET=dev-secret-change-me`.
- Last focused command: `pnpm --filter @atlaspm/playwright e2e tests/p0-regression-smoke.spec.ts`
- Files changed: `infra/docker/docker-compose.yml`
- Next 1-3 actions:
  1. Commit and push the E2E compose-secret fix.
  2. Watch PR #318 checks for the rerun on the new commit.
  3. If E2E still fails, inspect the next job log rather than widening the auth validator again.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed local setup first in this worktree:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
- Focused reproduction:
  - Added two narrow tests in `apps/core-api/test/dev-auth-environment.test.ts` for missing secret and obvious default secret.
  - Reproduced on the first real run: `promise resolved "NestApplication{ … }" instead of rejecting` for both cases.
- Current focused verification passing:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts --reporter=dot`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Added `getValidatedDevAuthSecret()` in `apps/core-api/src/auth/dev-auth-environment.ts`.
  - Startup now rejects missing secrets, secrets shorter than 16 chars, and obvious defaults including `dev-secret` and `dev-secret-change-me`.
  - `AuthService` now uses the validated secret for both dev token verification and minting, with no fallback secret.
- CI repair notes:
  - Pulled the failing log with `gh run view 22850125550 --job 66276330387 --log`.
  - Exact CI stack: `Error: DEV_AUTH_SECRET is too weak. Choose a non-default secret.` from `test/core.integration.test.ts > Core API Integration`.
  - Updated the integration fixture secret from `dev-secret-change-me` to `atlaspm-integration-secret-123`.
  - Local `pnpm --filter @atlaspm/core-api test` only passed after building `@atlaspm/domain` first, because running the filtered `core-api` test alone in this worktree can miss the workspace package build that root CI gets via recursive order.
  - Current repair verification passing:
    - `pnpm --filter @atlaspm/domain test`
    - `pnpm --filter @atlaspm/core-api test`
- Review follow-up notes:
  - Added `replace-with-a-random-dev-auth-secret` and `replace-me` to `DISALLOWED_DEV_AUTH_SECRETS`.
  - Changed `apps/core-api/.env.example` to `DEV_AUTH_SECRET=replace-me` so the shipped example fails closed even before the explicit placeholder block is considered.
  - Added a focused env test covering repo-shipped placeholder rejection.
  - Current review verification passing:
    - `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts --reporter=dot`
    - `pnpm --filter @atlaspm/domain test`
    - `pnpm --filter @atlaspm/core-api test`
- E2E repair notes:
  - Pulled the failing log with `gh run view 22850428040 --job 66277529591 --log`.
  - Exact CI stack: `atlaspm-core-api` crashed on startup because `infra/docker/docker-compose.yml` still set `DEV_AUTH_SECRET=dev-secret-change-me`.
  - Updated compose to use `DEV_AUTH_SECRET=atlaspm-e2e-dev-auth-secret-123`.
  - Current E2E-focused verification passing:
    - `docker compose -f infra/docker/docker-compose.yml up -d postgres core-api collab-server web-ui`
    - `curl -fsS http://localhost:3001/docs >/dev/null`
    - `curl -fsS http://localhost:3000/login >/dev/null`
    - `pnpm --filter @atlaspm/playwright e2e tests/p0-regression-smoke.spec.ts`
    - `docker compose -f infra/docker/docker-compose.yml down`
