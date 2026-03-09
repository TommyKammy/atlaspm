# Issue #313: P0: Remove default dev auth secret fallback and require explicit secret

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/313
- Branch: codex/reopen-issue-313
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-313
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-313/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 3
- Last head SHA: c0f5e2d5a7596a28991efc2f3653cdf5cc1e0a79
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5y_OUA|PRRT_kwDORWcwRc5y_OUb
- Repeated failure signature count: 1
- Updated at: 2026-03-09T11:02:02.550Z

## Latest Codex Summary
Pulled the failing Actions log, reproduced the actual CI breakage, and fixed the stale integration fixture. The failure was not in the validator itself; `apps/core-api/test/core.integration.test.ts` was still using `DEV_AUTH_SECRET='dev-secret-change-me'`, which the new guard now correctly rejects. I changed that fixture to a non-default secret, committed it as `c0f5e2d` (`Fix dev auth integration test secret`), and pushed `codex/reopen-issue-313` to update PR #318.

Local verification passed for the relevant CI path after matching workspace order:
- `pnpm --filter @atlaspm/domain test`
- `pnpm --filter @atlaspm/core-api test`

`gh pr checks 318` now reports no checks yet on the updated branch, so the rerun is still pending.

Summary: Fixed the PR #318 test failure by replacing the banned default-style dev auth secret in `core.integration.test.ts`, verified locally, and pushed `c0f5e2d`.
State hint: waiting_ci
Blocked reason: none
Tests: `gh run view 22850125550 --job 66276330387 --log`; `pnpm --filter @atlaspm/domain test`; `pnpm --filter @atlaspm/core-api test`
Failure signature: none
Next action: wait for PR #318 checks to start and confirm the `test` job passes on commit `c0f5e2d`

## Active Failure Context
- Category: review
- Summary: 2 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/318#discussion_r2904707249
- Details:
  - apps/core-api/.env.example:9 `DEV_AUTH_SECRET=replace-with-a-random-dev-auth-secret` is long enough to satisfy the new min-length check and isn't currently disallowed, so enabling `DEV_AUTH_ENABLED=true` with the example file will still run dev auth with a known secret. Update this example to a value that is guaranteed to be rejected by validation (or ensure the validator explicitly blocks this placeholder).
  - apps/core-api/src/auth/dev-auth-environment.ts:10 The new `.env.example` placeholder (`replace-with-a-random-dev-auth-secret`) currently passes `getValidatedDevAuthSecret()` (>=16 chars and not in `DISALLOWED_DEV_AUTH_SECRETS`). This undermines the goal of rejecting obvious defaults—someone can enable dev auth with a known, repo-shipped secret. Consider either adding this placeholder (and any other shipped placeholders) to `DISALLOWED_DEV_AUTH_SECRETS`, or changing the example value to something that is guaranteed to fail validation (e.g., a short string) while keeping the docs instructive.

## Codex Working Notes
### Current Handoff
- Hypothesis: The open bot review is valid. The checked-in `.env.example` placeholder should be guaranteed-invalid, and the validator should explicitly reject repo-shipped placeholder secrets so copied example values cannot silently enable dev auth.
- Primary failure or risk: `apps/core-api/.env.example` used `replace-with-a-random-dev-auth-secret`, which satisfied the current min-length rule and was not disallowed, so a known repo value could still enable dev auth if copied unchanged.
- Last focused command: `pnpm --filter @atlaspm/core-api test`
- Files changed: `apps/core-api/.env.example`, `apps/core-api/src/auth/dev-auth-environment.ts`, `apps/core-api/test/dev-auth-environment.test.ts`
- Next 1-3 actions:
  1. Commit and push the review follow-up for placeholder-secret rejection.
  2. Resolve the two automated review threads on PR #318 if GitHub permits after the push.
  3. Confirm checks remain green after the follow-up lands.

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
