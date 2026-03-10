# Issue #358: P3: Add regression coverage for goals, linkage, and rollups

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/358
- Branch: codex/reopen-issue-358
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-358
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-358/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 78a785e7db8ce02e0aabfaab40fdc37c83438ccb
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T23:29:04.371Z

## Latest Codex Summary
- Added focused regression coverage for goals across `core-api` integration and Playwright E2E, then fixed the permission and cache-refresh gaps those new tests exposed.

## Active Failure Context
- Resolved:
  - `project-goals-viewer-read-gap`
  - `project-goals-rollup-cache-stale`

## Codex Working Notes
### Current Handoff
- Hypothesis: Issue #358 was still missing the final regression layer. The narrowest real regression was that project viewers were blocked from reading aligned goals, and the project page did not refresh linked-goal rollups after a status update.
- Primary failure or risk: Local host commands still warn on unsupported Node 24, but the focused `core-api` integration file now runs successfully after building `@atlaspm/domain`, and the new Playwright goals spec passes against rebuilt Docker services.
- Last focused command: `E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts`
- Files changed: `apps/core-api/src/goals/goals.service.ts`, `apps/core-api/test/goals.integration.test.ts`, `apps/web-ui/src/app/projects/[id]/page.tsx`, `apps/web-ui/src/components/project-goals-card.tsx`, `apps/web-ui/src/components/project-status-updates.tsx`, `e2e/playwright/tests/goals.spec.ts`, and this journal.
- Next 1-3 actions:
  1. Commit this regression-coverage checkpoint on `codex/reopen-issue-358`.
  2. Open or update the issue PR so CI runs the new goals integration and Playwright coverage.
  3. If CI reports any goal-related flakes, inspect the uploaded Playwright trace from `e2e/playwright/tests/goals.spec.ts` first.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - Added `project viewers can read linked goals but cannot change goal alignment` to `apps/core-api/test/goals.integration.test.ts`.
  - Initial focused integration failure: `GET /projects/:id/goals` returned `403` for a project `VIEWER`; expected `200`.
  - Initial focused E2E failure: `project viewers can see aligned goals but not edit goal alignment or status updates` could not load seeded goals from stale Docker images until rebuild; after rebuild it confirmed the read-only project page behavior.
  - Second E2E failure after adding the owner flow: posting a project status update did not refresh the project goals card because `queryKeys.projectGoals(projectId)` was not invalidated.
- Failure signature:
  - `project-goals-viewer-read-gap`
  - `project-goals-rollup-cache-stale`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `E2E_REBUILD=1 E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts`
  - `E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts`
- Implementation notes:
  - `GoalsService.listProjectGoals` now accepts `ProjectRole.VIEWER` so read-only project members can see aligned goals.
  - `ProjectGoalsCard` now accepts `canEdit` and hides add/remove alignment controls for read-only users.
  - Project status updates now invalidate `queryKeys.projectGoals(projectId)` in addition to workspace goal queries, so project-page rollups refresh immediately.
  - Added `e2e/playwright/tests/goals.spec.ts` with:
    - owner CRUD/linkage/rollup/reload/history flow
    - viewer read-only alignment/status-update boundary flow
