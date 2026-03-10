# Issue #355: P3: Add goal domain models and project linkage contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/355
- Branch: codex/reopen-issue-355
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-355
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-355/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: decf13daa02b5433935c0d5fe7fadfc6bd603d5a
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T21:12:43.666Z

## Latest Codex Summary
- Added a new workspace-scoped goals slice in `apps/core-api` with Prisma goal/link models, CRUD endpoints, project link endpoints, and audit/outbox emission.
- Added a focused `apps/core-api/test/goals.integration.test.ts` contract that reproduces the missing `POST /goals` route and now passes.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Issue #355 was an unimplemented `core-api` slice. The narrowest missing contract was `POST /goals`, which returned `404` before implementation.
- Primary failure or risk: The focused goal CRUD/linkage contract is now passing locally. Remaining risk is lack of broader suite coverage beyond the new focused integration test and `core-api` type-check.
- Last focused command: `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`
- Files changed: `apps/core-api/prisma/schema.prisma`, `apps/core-api/prisma/migrations/20260311062000_add_goals_and_project_links/migration.sql`, `apps/core-api/src/app.module.ts`, `apps/core-api/src/goals/goals.module.ts`, `apps/core-api/src/goals/goals.controller.ts`, `apps/core-api/src/goals/goals.service.ts`, `apps/core-api/test/goals.integration.test.ts`
- Next 1-3 actions:
  1. Commit the goal domain + linkage slice on `codex/reopen-issue-355`.
  2. Decide whether to add broader integration coverage in `core.integration.test.ts` or keep the dedicated focused test file.
  3. Open or update a draft PR once the checkpoint is pushed.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts` initially failed at `apps/core-api/test/goals.integration.test.ts:86` with `expected 201 "Created", got 404 "Not Found"` for `POST /goals`.
- Environment prep needed in this worktree before the real reproduction:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/shared-types build`
- Failure signature:
  - `goals-post-route-missing`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Added a new `GoalStatus` enum plus `Goal` and `GoalProjectLink` Prisma models with a migration.
  - Implemented workspace-scoped goal CRUD at `/goals` and `/workspaces/:workspaceId/goals`.
  - Implemented goal-project link list/create/delete at `/goals/:id/projects`.
  - Goal writes emit `goal.created`, `goal.updated`, `goal.archived`, `goal.project_linked`, and `goal.project_unlinked` audit/outbox events.
