# Issue #346: P2: Add task and project follower domain models and API contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/346
- Branch: codex/reopen-issue-346
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-346
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-346/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: d178fe680e9f97f229ad030496491e448c0f3aff
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zTLx8|PRRT_kwDORWcwRc5zTLyo|PRRT_kwDORWcwRc5zTLzH
- Repeated failure signature count: 1
- Updated at: 2026-03-10T13:21:38.122Z

## Latest Codex Summary
Addressed the three automated review comments on PR #350 with no contract changes.

This switches task/project follower summary hydration from row scans to aggregate queries (`groupBy` for counts plus a current-user filtered lookup for follow state) and makes the follower slice schema assertions whitespace-tolerant. Focused slice and integration verification still pass after the review fixes.

Summary: Addressed the follower review comments with aggregate queries and a less brittle slice test
State hint: addressing_review
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api build`; `pnpm --filter @atlaspm/core-api exec vitest run test/followers-slice.test.ts`; `DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization'`
Failure signature: none
Next action: Commit and push the review-fix follow-up, then resolve the three automated PR review threads

## Active Failure Context
- Category: review
- Summary: 3 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/350#discussion_r2911694895
- Details:
  - apps/core-api/src/projects/projects.controller.ts:307 `hydrateProjectsWithFollowerState` fetches all `(projectId, userId)` follower rows for the listed projects and then counts them in memory. If projects have many followers, this will pull a lot of rows just to compute aggregates. Consider switching to `groupBy({ by: ['projectId'], _count: { _all: true } })` for follower counts and a separate query restricted to the current `userId` to compute `isFollowedByCurrentUser`.
  - apps/core-api/test/followers-slice.test.ts:46 The schema assertions are exact string matches (e.g. `'@@unique([taskId, userId])'`), which makes this slice test brittle to harmless formatting changes in `schema.prisma` (spacing, line wrapping). Using a regex similar to `routeDecoratorPattern` (tolerant to whitespace) would reduce noisy failures during refactors.
  - apps/core-api/src/tasks/tasks.controller.ts:2661 `hydrateTasksWithFollowerState` loads one row per follower (taskId/userId) for all tasks in the response just to compute `followerCount` and `isFollowedByCurrentUser`. This scales with total follower rows (could be large) and can slow down task list/detail responses. Consider using a `groupBy`/aggregate query for counts by `taskId`, plus a separate `findMany` filtered to `userId = req.user.sub` (and `taskId in [...]`) to compute the followed-id set without scanning all follower rows.

## Codex Working Notes
### Current Handoff
- Hypothesis: All three configured-bot comments were legitimate but low-risk review follow-ups: two performance improvements in follower summary hydration and one brittleness reduction in the slice test.
- Primary failure or risk: Remaining risk is mainly whether the PR needs any broader regression beyond the focused follower coverage; the review comments themselves are addressed.
- Last focused command: `DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization'`
- Files changed: `apps/core-api/src/projects/projects.controller.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, and `apps/core-api/test/followers-slice.test.ts`
- Next 1-3 actions:
  1. Commit the review-fix follow-up on `codex/reopen-issue-346`.
  2. Push the branch to update PR #350.
  3. Resolve the three configured-bot review threads if GitHub accepts the new commit as the fix.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `apps/core-api/test/followers-slice.test.ts` first so the branch failed on the missing `TaskFollower`/`ProjectFollower` models and follow-route contract.
  - Initial focused runner failures were environmental in this worktree: `vitest: not found` / `prisma: not found` until `pnpm install`, then `@atlaspm/domain` unresolved until `pnpm --filter @atlaspm/domain build`.
  - After dependencies were present, the slice test failed as intended on missing `model TaskFollower`.
- Failure signature:
  - `missing-task-project-follower-contract`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api build`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/followers-slice.test.ts`
  - `DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization'`
- Implementation notes:
  - `hydrateProjectsWithFollowerState` now uses `projectFollower.groupBy({ by: ['projectId'], _count: { _all: true } })` plus a `findMany` restricted to the current `userId`, instead of loading all follower rows into memory.
  - `hydrateTasksWithFollowerState` now uses the same aggregate pattern on `taskFollower`.
  - `followers-slice.test.ts` now matches schema snippets with whitespace-tolerant regex instead of exact string comparisons for the unique-constraint assertions.
