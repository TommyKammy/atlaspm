# Issue #363: P3: Add capacity schedule and time-off domain models

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/363
- Branch: codex/reopen-issue-363
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-363
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-363/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 2
- Last head SHA: 1a8fb5fb220be6be523cc01b14323829251b828b
- Blocked reason: none
- Last failure signature: e2e:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-11T00:30:44.516Z

## Latest Codex Summary
Implemented the `core-api` slice for issue `#363` and committed it as `1a8fb5f` (`feat: add capacity schedules and time off`).

This adds Prisma models and migration for capacity schedules and time-off, a new capacity module with CRUD/query endpoints, workspace-admin write auth with member read auth, and workload capacity inheritance from user schedule to workspace default with time-off subtracted from weekly effort capacity. The focused reproducer is [`apps/core-api/test/capacity.integration.test.ts`](/home/tommy/Dev/atlaspm-worktrees/issue-363/apps/core-api/test/capacity.integration.test.ts), and the main implementation lives under [`apps/core-api/src/capacity/`](/home/tommy/Dev/atlaspm-worktrees/issue-363/apps/core-api/src/capacity/capacity.service.ts) plus workload integration in [`apps/core-api/src/workload/workload.service.ts`](/home/tommy/Dev/atlaspm-worktrees/issue-363/apps/core-api/src/workload/workload.service.ts).

Summary: Added workspace-default and user-specific capacity schedules, user time-off CRUD, workload capacity inheritance/time-off handling, a focused integration test, and committed the checkpoint as `1a8fb5f`.
State hint: stabilizing
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/domain build`; `pnpm --filter @atlaspm/core-api prisma:generate && pnpm --filter @atlaspm/core-api type-check`; `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`; `pnpm --filter @atlaspm/core-api type-check`
Failure signature: none
Next action: Open or update the draft PR for `codex/reopen-issue-363`, then decide whether broader verification is needed beyond the focused `core-api` test/type-check pass.

## Active Failure Context
- Category: checks
- Summary: PR #373 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/373
- Details:
  - e2e (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22930597973/job/66551161894

## Codex Working Notes
### Current Handoff
- Hypothesis: PR #373’s failing `e2e` check is CI infrastructure noise in Docker’s GitHub Action summary/build-record post-processing, not a product-level E2E regression in the capacity/time-off feature.
- Primary failure or risk: `docker/build-push-action@v6` failed in the `Build core-api image (cached)` step before Playwright started, with `invalid character '<' looking for beginning of value` while handling build summary/build-record output.
- Last focused command: `gh run view 22930597973 --job 66551161894 --log | rg -n "invalid character|##\\[error\\]|buildx failed|Build core-api"`
- Files changed: `.github/workflows/ci.yml` and this journal.
- Next 1-3 actions:
  1. Commit and push the workflow mitigation that disables Docker build summaries/build-record uploads in the `e2e` job.
  2. Rerun or wait for PR #373 CI and confirm the job reaches Playwright instead of failing during image build post-processing.
  3. If `e2e` still fails after rerun, inspect the new job for the first actual application-level failure.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - Added `apps/core-api/test/capacity.integration.test.ts` to prove the missing contract first.
  - Initial feature failure: `POST /workspaces/:workspaceId/capacity-schedules` returned `404` because no capacity/time-off API existed.
  - Secondary setup failures while reproducing:
    - `prisma: not found` before `pnpm install`
    - Vite failed to resolve `@atlaspm/domain` before `pnpm --filter @atlaspm/domain build`
  - Behavioral follow-up during implementation:
    - Workload overload stayed empty because task estimates are updated through `PATCH /tasks/:id/estimate`, not task creation.
  - CI repair follow-up:
    - `gh pr checks 373` showed only `e2e` failing.
    - `gh run view 22930597973 --job 66551161894 --log` showed the job failed in `Build core-api image (cached)`, not in Playwright.
    - The actionable error was `buildx failed with ... invalid character '<' looking for beginning of value`, emitted while Docker’s action was generating/uploading build summaries/records.
- Failure signature:
  - `docker-build-summary-parse-failure`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts` (failed: missing route)
  - `pnpm --filter @atlaspm/core-api prisma:generate && pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts` (passed)
  - `pnpm --filter @atlaspm/core-api type-check`
  - `gh pr checks 373`
  - `gh run view 22930597973 --job 66551161894 --log`
  - `gh run view 22930597973 --job 66551161894 --log | rg -n "invalid character|##\\[error\\]|buildx failed|Build core-api"`
  - `git diff --check`
- Implementation notes:
  - Added Prisma models `CapacitySchedule` and `TimeOffEvent` plus migration `20260311093000_add_capacity_schedules_and_time_off`.
  - Added `CapacityModule` with CRUD endpoints:
    - `POST/GET /workspaces/:workspaceId/capacity-schedules`
    - `PATCH /capacity-schedules/:id`
    - `POST/GET /workspaces/:workspaceId/time-off`
    - `PATCH/DELETE /time-off/:id`
  - Authorization model:
    - workspace members can read schedules/time-off
    - workspace admins can create, update, and delete them
  - Inheritance model:
    - workload uses the latest user-specific schedule if one exists
    - otherwise it falls back to the latest workspace-default schedule
    - otherwise it falls back to the legacy 40h default
  - Workload overload capacity now subtracts overlapping time-off minutes from schedule-derived weekly capacity.
  - CI mitigation:
    - Added `DOCKER_BUILD_SUMMARY: false` and `DOCKER_BUILD_RECORD_UPLOAD: false` to the cached Docker build steps in `.github/workflows/ci.yml` so the `e2e` job no longer depends on Docker action summary/build-record post-processing.
