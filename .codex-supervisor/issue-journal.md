# Issue #363: P3: Add capacity schedule and time-off domain models

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/363
- Branch: codex/reopen-issue-363
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-363
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-363/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 3
- Last head SHA: 06eef0c5910bc0e38409f661105673aade8ca53d
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zdPDb|PRRT_kwDORWcwRc5zdPDo|PRRT_kwDORWcwRc5zdPDy|PRRT_kwDORWcwRc5zdPD3|PRRT_kwDORWcwRc5zdPD6|PRRT_kwDORWcwRc5zdPD9
- Repeated failure signature count: 1
- Updated at: 2026-03-11T00:38:04.837Z

## Latest Codex Summary
Inspected PR `#373`’s failing `e2e` job and the failure was not a Playwright regression. The job died in the cached Docker image build step, specifically `docker/build-push-action@v6`, with a build-summary/build-record parse error: `invalid character '<' looking for beginning of value`. I mitigated that by disabling Docker build summaries/build-record uploads for the cached image build steps in [`ci.yml`](/home/tommy/Dev/atlaspm-worktrees/issue-363/.github/workflows/ci.yml), updated the issue journal, committed it as `06eef0c` (`fix: disable docker build summaries in e2e ci`), and pushed `codex/reopen-issue-363`.

The branch is clean and PR `#373` now points at `06eef0c5910bc0e38409f661105673aade8ca53d`. No new local product failure was reproduced; this was a workflow-level CI repair.

Summary: Fixed PR `#373`’s failing `e2e` job by disabling Docker build summary/build-record post-processing in the cached image build steps, then pushed commit `06eef0c`.
State hint: waiting_ci
Blocked reason: none
Tests: `gh pr checks 373`; `gh run view 22930597973 --job 66551161894 --log`; `gh run view 22930597973 --job 66551161894 --log | rg -n "invalid character|##\\[error\\]|buildx failed|Build core-api"`; `git diff --check`
Failure signature: none
Next action: Watch PR `#373`’s rerun CI and confirm the `e2e` job now gets past Docker image build setup into actual Playwright execution.

## Active Failure Context
- Category: review
- Summary: 6 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/373#discussion_r2915224243
- Details:
  - apps/core-api/src/workload/workload.service.ts:285 `detectOverload()` resolves capacity by calling `capacityService.resolveWeeklyCapacityMinutes()` for every week. Since that method performs multiple DB queries, longer ranges (or team workload across many users) can turn into an N+1 query pattern. Consider a batch method that fetches schedules once + all overlapping time-off once, then computes capacities per-week in memory.
  - apps/core-api/src/workload/workload.service.ts:288 `groupByWeek()` produces week boundaries using local-time `setDate()/setHours()`, but capacity resolution iterates days using UTC day math. On non-UTC servers this can shift which days are counted in a week. Consider normalizing week boundaries to UTC (use `getUTCDay()/setUTCDate()/setUTCHours`) or making capacity resolution use the same time basis as `groupByWeek()`.
  - apps/core-api/prisma/schema.prisma:133 Capacity schedule uniqueness is only enforced in application logic. Because `subjectUserId` is nullable, Postgres UNIQUE on (workspaceId, subjectType, subjectUserId) would still allow multiple WORKSPACE schedules (multiple NULLs). Add DB-level constraints (e.g., partial unique indexes per subjectType and a CHECK tying subjectType to subjectUserId nullability) to guarantee the invariant and avoid races.
  - apps/core-api/prisma/migrations/20260311093000_add_capacity_schedules_and_time_off/migration.sql:40 This migration creates non-unique indexes for capacity_schedules but doesn't enforce the intended 'one schedule per subject' invariant. Consider adding partial UNIQUE indexes (e.g., unique (workspace_id) where subject_type='WORKSPACE' and subject_user_id IS NULL; unique (workspace_id, subject_user_id) where subject_type='USER') so concurrent creates can't produce duplicates. ```suggestion -- Enforce one schedule per workspace-level subject CREATE UNIQUE INDEX "capacity_schedules_workspace_subject_unique" ON "capacity_schedules"("workspace_id") WHERE "subject_type" = 'WORKSPACE' AND "subject_user_id" IS NULL; -- Enforce one schedule per user-level subject within a workspace CREATE UNIQUE INDEX "capacity_schedules_user_subject_unique" ON "capacity_schedules"("workspace_id", "subject_user_id") WHERE "subject_type" = 'USER' AND "subject_user_id" IS NOT NULL; ```
  - apps/core-api/src/capacity/capacity.service.ts:45 The pre-insert `findFirst` duplicate check is race-prone: two concurrent requests can both pass the check and insert duplicates. With DB-level uniqueness in place, rely on the constraint and map unique-violation errors to a 409 Conflict instead of doing a separate read-before-write check.

## Codex Working Notes
### Current Handoff
- Hypothesis: The automated review comments were valid; the current branch now addresses them with DB-backed schedule invariants, race-free schedule creation, batched weekly capacity lookup, and UTC-normalized workload week math.
- Primary failure or risk: No current local failure. Remaining risk is only CI confirmation plus whether reviewers accept the explicit `UTC` restriction for `timeZone` until timezone-aware capacity math is implemented.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check && pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`
- Files changed: `apps/core-api/prisma/schema.prisma`, `apps/core-api/prisma/migrations/20260311094500_capacity_schedule_constraints/migration.sql`, `apps/core-api/src/capacity/capacity.service.ts`, `apps/core-api/src/workload/workload.service.ts`, `apps/core-api/test/capacity.integration.test.ts`, and this journal.
- Next 1-3 actions:
  1. Commit and push the review-fix patch set.
  2. Resolve the addressed Copilot review threads on PR #373.
  3. Watch CI, especially the rerun `e2e` check, for any remaining non-review failures.

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
  - Review follow-up:
    - Replaced the race-prone pre-insert duplicate read with DB-level uniqueness and `P2002` -> `409 Conflict` handling.
    - Added a follow-up migration for `capacity_schedules` partial unique indexes plus a `CHECK` tying `subject_type` and `subject_user_id`.
    - Batched workload weekly capacity resolution so one user/workload request fetches schedules once and overlapping time-off once.
    - Normalized workload week boundaries to UTC and restricted `timeZone` input to `UTC` until timezone-aware schedule math exists.
- Failure signature:
  - `review-capacity-invariants-and-workload-batching`
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
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`
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
  - Review fixes:
    - Added migration `20260311094500_capacity_schedule_constraints` to enforce subject nullability and one-schedule-per-subject at the DB layer.
    - `CapacityService.createCapacitySchedule` now relies on the DB constraint and maps unique violations to `409 Conflict`.
    - `CapacityService.resolveWeeklyCapacityMinutesBatch` fetches schedules/time-off once per user/range and computes per-week capacities in memory.
    - `WorkloadService` now uses UTC-normalized week boundaries (`setUTCDate`/`setUTCHours`) and consumes batched capacity results.
    - `CapacityService` currently accepts only `timeZone === 'UTC'`, making the stored value honest until timezone-aware day-of-week calculations are implemented.
    - `apps/core-api/test/capacity.integration.test.ts` now covers duplicate schedule rejection and non-UTC schedule rejection.
