# Issue #313: P0: Remove default dev auth secret fallback and require explicit secret

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/313
- Branch: codex/reopen-issue-313
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-313
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-313/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 2
- Last head SHA: fd0115da7e2bdef48bb7e15d5fa3a35ca762a925
- Blocked reason: none
- Last failure signature: test:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-09T10:57:43.278Z

## Latest Codex Summary
Added a focused fix for issue #313 and committed it as `fd0115d` (`Require explicit dev auth secret`).

`core-api` no longer falls back to `'dev-secret'`. Startup now validates `DEV_AUTH_SECRET` whenever `DEV_AUTH_ENABLED=true`, rejecting missing values, secrets shorter than 16 characters, and obvious defaults like `dev-secret` / `dev-secret-change-me`. `AuthService` uses the same validator for both dev token minting and verification, and the narrow env spec now covers missing-secret and weak-secret failures. I also updated the dev env docs/examples to require an explicit non-default secret.

Tests run:
- `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts --reporter=dot`
- `pnpm --filter @atlaspm/core-api type-check`

Summary: Removed dev auth secret fallback, added startup/usage validation, covered missing and weak secrets, and committed the checkpoint as `fd0115d`.
State hint: implementing
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts --reporter=dot`; `pnpm --filter @atlaspm/core-api type-check`
Failure signature: none
Next action: run one broader `core-api` auth/integration verification pass, then open or update the draft PR for issue #313

## Active Failure Context
- Category: checks
- Summary: PR #318 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/318
- Details:
  - test (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22850125550/job/66276330387

## Codex Working Notes
### Current Handoff
- Hypothesis: The remaining CI failure is not new logic in the validator; it is an outdated integration-test fixture still booting `core-api` with the now-banned default-style secret `dev-secret-change-me`.
- Primary failure or risk: PR #318 `test` failed in `apps/core-api test` because `test/core.integration.test.ts` set `process.env.DEV_AUTH_SECRET = 'dev-secret-change-me'`, which now trips `getValidatedDevAuthSecret()` during `app.init()`.
- Last focused command: `pnpm --filter @atlaspm/core-api test`
- Files changed: `apps/core-api/test/core.integration.test.ts`
- Next 1-3 actions:
  1. Commit the CI repair that swaps the stale integration secret to a non-default value.
  2. Push `codex/reopen-issue-313` and confirm PR #318 checks re-run cleanly.
  3. If CI still reports red, inspect the new failing job rather than widening the change.

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
