# Issue #365: P3: Build workload UI indicators and filters for over-capacity states

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/365
- Branch: codex/reopen-issue-365
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-365
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-365/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 872da0f20a2fe69d027b730c4f2b15b86e58ffa3
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zdilP|PRRT_kwDORWcwRc5zdild|PRRT_kwDORWcwRc5zdilj|PRRT_kwDORWcwRc5zdilm
- Repeated failure signature count: 1
- Updated at: 2026-03-11T10:20:28+09:00

## Latest Codex Summary
Implemented the workload capacity UI slice and committed it as `872da0f` (`Add workload capacity indicators and filters`).

The main fix is that workload weeks now carry real capacity data from the API, so the page no longer relies on fixed `40h` / `10 task` thresholds. The UI in [page.tsx](/home/tommy/Dev/atlaspm-worktrees/issue-365/apps/web-ui/src/app/workspaces/[workspaceId]/workload/page.tsx) now shows over-capacity and reduced-capacity indicators, plus client-side filters for `over-capacity`, `reduced-capacity`, and `available`. I also added a focused repro/guard test in [workload-helpers.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-365/apps/web-ui/src/app/workspaces/[workspaceId]/workload/workload-helpers.test.ts) and extended the workload contract in [workload.service.ts](/home/tommy/Dev/atlaspm-worktrees/issue-365/apps/core-api/src/workload/workload.service.ts) to expose `capacityMinutes` and `capacityTasks` per week.

Focused verification passed:
`pnpm install`
`pnpm --filter @atlaspm/web-ui test -- src/app/workspaces/[workspaceId]/workload/workload-helpers.test.ts`
`pnpm --filter @atlaspm/web-ui type-check`
`pnpm --filter @atlaspm/domain build`
`pnpm --filter @atlaspm/core-api type-check`
`pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`

Summary: Added real capacity-backed workload indicators and filters in `web-ui`, extended the workload API contract for weekly capacity, added focused tests, and checkpoint-committed the slice.
State hint: local_review
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/web-ui test -- src/app/workspaces/[workspaceId]/workload/workload-helpers.test.ts`; `pnpm --filter @atlaspm/web-ui type-check`; `pnpm --filter @atlaspm/domain build`; `pnpm --filter @atlaspm/core-api type-check`; `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`
Failure signature: none
Next action: Open or update the draft PR for this branch and, if needed, run a broader `web-ui` smoke pass around the workload page filter UX.

## Active Failure Context
- Category: review
- Summary: 4 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/374#discussion_r2915329668
- Details:
  - apps/core-api/test/capacity.integration.test.ts:245 `workloadWeek` can be `undefined` if the weekly label changes or the API returns a different set of weeks; the subsequent `workloadWeek.capacityMinutes` / `capacityTasks` assertions would then throw a less-informative runtime error. Add an explicit `expect(workloadWeek).toBeTruthy()` (or use optional chaining in the expects) before asserting on its fields so failures point to the real mismatch. ```suggestion expect(overloadedWeek.excess).toBe(780); expect(workloadWeek).toBeTruthy(); ```
  - apps/web-ui/src/app/workspaces/[workspaceId]/workload/workload-helpers.ts:49 `getWorkloadStatus()` builds `weeklyStates` by calling `workload.overloadAlerts.find(...)` inside the `map()`, making it O(weeks * alerts) each time this helper runs. Since this status helper is called repeatedly (for filtering, counts, and rendering), consider building a `Map` of overload alerts keyed by `week` once and doing O(1) lookups while iterating weeks.
  - apps/web-ui/src/app/workspaces/[workspaceId]/workload/page.tsx:65 `getWorkloadStatus()` is recomputed multiple times per render here (for `filteredWorkload` and each of the three counts), and each computation iterates over every week in a workload. For larger teams/periods this can become noticeable; consider precomputing a per-user status map (e.g. via `useMemo`) and deriving both the counts and `filteredWorkload` from that single pass.
  - apps/web-ui/src/app/workspaces/[workspaceId]/workload/page.tsx:244 Inside the `visibleWeeks.map(...)` render, `workload.overloadAlerts.find(...)` runs once per week row. If there are many weeks (or if this component renders often), this creates repeated linear scans. Consider precomputing an `alertsByWeek` map/object once per card (before the JSX) and doing constant-time lookups while rendering.

## Codex Working Notes
### Current Handoff
- Hypothesis: All four automated review comments are valid and can be fixed without changing behavior: tighten one test assertion, cache overload alerts by week in workload helpers/cards, and precompute per-user workload status once per render.
- Primary failure or risk: No current local failure after the review-fix patch. Remaining risk is only remote CI / PR thread resolution.
- Last focused command: `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`
- Files changed: `apps/core-api/test/capacity.integration.test.ts`, `apps/web-ui/src/app/workspaces/[workspaceId]/workload/workload-helpers.ts`, `apps/web-ui/src/app/workspaces/[workspaceId]/workload/page.tsx`, and this journal.
- Next 1-3 actions:
  1. Commit and push the review-fix patch.
  2. Resolve the four Copilot review threads on PR #374.
  3. Watch PR checks, especially `e2e`, until the merge state is stable.

### Scratchpad
- Review follow-up:
  - Added `expect(workloadWeek).toBeTruthy()` before asserting weekly capacity fields in `apps/core-api/test/capacity.integration.test.ts`.
  - Added `createAlertsByWeekMap()` in `apps/web-ui/src/app/workspaces/[workspaceId]/workload/workload-helpers.ts` so helper lookups are O(1) per week instead of repeated `.find(...)`.
  - `getWorkloadStatus()` now walks weeks once and returns early on over-capacity instead of building an intermediate array.
  - `filterWeeks()` accepts a precomputed alerts map.
  - `apps/web-ui/src/app/workspaces/[workspaceId]/workload/page.tsx` now computes per-user workload status and counts in one pass per render, then reuses the results for filtering and counts.
  - `UserWorkloadCard` now builds `alertsByWeek` once and reuses it for both header status and week rows.
- Review verification:
  - `pnpm --filter @atlaspm/web-ui test -- src/app/workspaces/[workspaceId]/workload/workload-helpers.test.ts`
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`

    - effort weeks still used `2400` instead of API capacity `420`
    - reduced-capacity task weeks were reported as `available`
  - That exposed a contract gap: `overloadAlerts` carried `capacity`, but non-overloaded reduced-capacity weeks had no capacity data at all.
- Implementation:
  - `apps/core-api/src/workload/workload.service.ts` now annotates every `weeklyBreakdown` entry with `capacityMinutes` and `capacityTasks` before computing overload alerts.
  - `apps/web-ui/src/lib/api/workload.ts` accepts the new weekly capacity fields.
  - `apps/web-ui/src/app/workspaces/[workspaceId]/workload/workload-helpers.ts` centralizes week/person status derivation and filtering.
  - `apps/web-ui/src/app/workspaces/[workspaceId]/workload/page.tsx` now:
    - uses actual weekly capacity instead of fixed thresholds
    - shows reduced-capacity indicators
    - adds client-side filters for `over-capacity`, `reduced-capacity`, and `available`
    - narrows visible week rows inside each card when a capacity filter is active
- Verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/web-ui test -- src/app/workspaces/[workspaceId]/workload/workload-helpers.test.ts` (failed first, then passed)
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`
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
  - `workload-ui-ignored-api-capacity`
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
