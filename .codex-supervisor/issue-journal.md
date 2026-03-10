# Issue #356: P3: Implement goal progress rollups and status history

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/356
- Branch: codex/reopen-issue-356
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-356
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-356/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: b13813d88059e62725fd0865ffeaf14fcb41b857
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T21:44:25.320Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Goal rollups were still unimplemented after the basic goals slice landed. The narrowest missing contract was that linked project status updates did not change goal `status`/`progressPercent`, and there was no queryable goal history endpoint.
- Primary failure or risk: `GoalsService` stored manual status/progress only. `POST /projects/:id/status-updates` left linked goals at `NOT_STARTED`, and `GET /goals/:id/history` did not exist.
- Last focused command: `pnpm --filter @atlaspm/core-api exec eslint src/goals/goals.controller.ts src/goals/goals.module.ts src/goals/goals.service.ts src/projects/project-status-updates.controller.ts`
- Files changed: `apps/core-api/src/goals/goals.controller.ts`, `apps/core-api/src/goals/goals.module.ts`, `apps/core-api/src/goals/goals.service.ts`, `apps/core-api/src/projects/project-status-updates.controller.ts`, `apps/core-api/test/goals.integration.test.ts`
- Next 1-3 actions:
  1. Commit the goal rollup/history checkpoint on `codex/reopen-issue-356`.
  2. Decide whether to broaden rollups beyond project health snapshots or keep this first pass scoped to latest linked project status updates.
  3. If a PR does not exist yet for #356, open a draft PR from this checkpoint.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - After `pnpm install`, `pnpm --filter @atlaspm/domain build`, and `pnpm --filter @atlaspm/shared-types build`, the new goal rollup test failed at `apps/core-api/test/goals.integration.test.ts:293` with `expected 'NOT_STARTED' to be 'ON_TRACK'` after creating a linked project status update.
- Failure signature:
  - `goal-rollup-not-applied`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api exec eslint src/goals/goals.controller.ts src/goals/goals.module.ts src/goals/goals.service.ts src/projects/project-status-updates.controller.ts`
- Implementation notes:
  - Goal rollup uses each linked project's latest `ProjectStatusUpdate.health`: `ON_TRACK=100`, `AT_RISK=50`, `OFF_TRACK=0`, then averages across active links for `progressPercent`.
  - Goal status rollup takes the worst latest linked health: any `OFF_TRACK` wins, else any `AT_RISK`, else any `ON_TRACK`, else `NOT_STARTED`.
  - `POST /projects/:id/status-updates` now refreshes linked goal rollups inside the same transaction.
  - `GET /goals/:id/history` exposes status/progress snapshots from goal audit events, including dedicated `goal.status_rollup_updated` events.
