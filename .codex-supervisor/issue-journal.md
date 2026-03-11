# Issue #363: P3: Add capacity schedule and time-off domain models

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/363
- Branch: codex/reopen-issue-363
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-363
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-363/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: c275cd5257676414cabb34f7d3c74fd7818ba585
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-11T00:17:22.996Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Issue #363 is now implemented locally in `core-api` with workspace-default and user-specific capacity schedules, user time-off CRUD, and workload availability integration.
- Primary failure or risk: No current local failure. Remaining risk is scope alignment on whether a future `Team` entity should replace or extend the current workspace-default inheritance model.
- Last focused command: `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`
- Files changed: `apps/core-api/prisma/schema.prisma`, `apps/core-api/prisma/migrations/20260311093000_add_capacity_schedules_and_time_off/migration.sql`, `apps/core-api/src/app.module.ts`, `apps/core-api/src/capacity/capacity.controller.ts`, `apps/core-api/src/capacity/capacity.module.ts`, `apps/core-api/src/capacity/capacity.service.ts`, `apps/core-api/src/workload/workload.module.ts`, `apps/core-api/src/workload/workload.service.ts`, `apps/core-api/test/capacity.integration.test.ts`, and this journal.
- Next 1-3 actions:
  1. Commit the `core-api` checkpoint for capacity schedules and time-off models.
  2. Open or update the draft PR for branch `codex/reopen-issue-363`.
  3. If review requests literal team-level inheritance, extend the subject model from workspace-default to a dedicated team entity in a follow-up.

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
- Failure signature:
  - `capacity-schedule-route-missing`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts` (failed: missing route)
  - `pnpm --filter @atlaspm/core-api prisma:generate && pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts` (passed)
  - `pnpm --filter @atlaspm/core-api type-check`
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
