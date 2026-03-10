# Issue #346: P2: Add task and project follower domain models and API contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/346
- Branch: codex/reopen-issue-346
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-346
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-346/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: eaf241d026385f332273e0997397d23f64f40572
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T13:04:33.513Z

## Latest Codex Summary
- Added first-class task/project follower persistence, follow API routes, follower summary fields on task/project payloads, and focused slice/integration coverage.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The narrowest safe proof for #346 was a follower slice test that asserted the missing Prisma models and follow-route contract before implementing the full task/project follower behavior.
- Primary failure or risk: Main remaining risk is broader regression outside the new follower endpoints, since verification so far is focused to the follower slice and a single targeted integration flow.
- Last focused command: `DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization'`
- Files changed: `apps/core-api/prisma/schema.prisma`, `apps/core-api/prisma/migrations/20260310131000_add_task_project_followers/migration.sql`, `apps/core-api/src/projects/projects.controller.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, `apps/core-api/test/followers-slice.test.ts`, and `apps/core-api/test/core.integration.test.ts`
- Next 1-3 actions:
  1. Commit the follower contract checkpoint on `codex/reopen-issue-346`.
  2. Decide whether to stop at the focused slice or expand verification to adjacent task/project read flows before opening/updating a draft PR.
  3. If staying on this issue, run a slightly broader `core-api` regression slice around task/project CRUD after the checkpoint commit.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `apps/core-api/test/followers-slice.test.ts` first so the branch failed on the missing `TaskFollower`/`ProjectFollower` models and follow-route contract.
  - Initial focused runner failures were environmental in this worktree: `vitest: not found` / `prisma: not found` until `pnpm install`, then `@atlaspm/domain` unresolved until `pnpm --filter @atlaspm/domain build`.
  - After dependencies were present, the slice test failed as intended on missing `model TaskFollower`.
- Failure signature:
  - `missing-task-project-follower-contract`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/followers-slice.test.ts`
  - `DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api prisma:migrate`
  - `pnpm --filter @atlaspm/core-api build`
  - `DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization'`
- Implementation notes:
  - Added `TaskFollower` and `ProjectFollower` Prisma models plus migration-backed uniqueness constraints on `(taskId, userId)` and `(projectId, userId)`.
  - Added `GET/POST/DELETE` follower routes for tasks and projects, with duplicate-follow conflicts translated from `P2002`, idempotent unfollow responses, and audit/outbox entries for follow/unfollow events.
  - Added `followerCount` and `isFollowedByCurrentUser` to project list/create payloads and task list/get/create/patch payloads.
  - Focused integration coverage verifies follow, duplicate, list, auth denial, unfollow, and audit/outbox for both resource types.
