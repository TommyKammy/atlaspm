# Issue #347: P2: Extend notification fan-out to task and project followers

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/347
- Branch: codex/reopen-issue-347
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-347
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-347/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 9b4c15a8f3bd7f4fb573bd8aabf05d9e732c4023
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T13:36:41.841Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Notification fan-out was never extended after follower models shipped, so task followers only received existing assignee notifications and project followers received no inbox notifications for status updates.
- Primary failure or risk: The focused follower notification slice is now passing; remaining risk is limited to adjacent task schedule mutation routes that were not added to the focused regression.
- Last focused command: `SEARCH_ENABLED=${SEARCH_ENABLED:-false} DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization|project status updates fan out mention notifications and include mention context for reminder hooks|task comments and project status updates notify followers without duplicate delivery'`
- Files changed: `apps/core-api/src/notifications/notifications.service.ts`, `apps/core-api/src/projects/project-status-updates.controller.ts`, `apps/core-api/src/tasks/task-comments.service.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, and `apps/core-api/test/core.integration.test.ts`
- Next 1-3 actions:
  1. Commit the focused follower-notification routing slice on `codex/reopen-issue-347`.
  2. Push the branch and open a draft PR for issue #347.
  3. If broader confidence is needed, add a focused regression around follower fan-out from `PATCH /tasks/:id/reschedule` or similar schedule mutation routes.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added a focused integration test covering a follower-only task comment recipient, a follower+assignee dedupe case, and a follower-only project status update recipient.
  - Fresh-worktree setup required `pnpm install`, `pnpm --filter @atlaspm/core-api exec prisma generate`, `pnpm --filter @atlaspm/core-api exec prisma migrate deploy`, and `pnpm --filter @atlaspm/domain build` before behavior tests could run.
  - The first real behavior failure was `expected [] to have a length of 1 but got +0` for the follower-only task comment notification assertion.
- Failure signature:
  - `missing-follower-notification-fanout`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api build`
  - `SEARCH_ENABLED=${SEARCH_ENABLED:-false} DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization|project status updates fan out mention notifications and include mention context for reminder hooks|task comments and project status updates notify followers without duplicate delivery'`
- Implementation notes:
  - Added centralized recipient collection in `NotificationsService` for task followers plus assignee dedupe and for project follower fan-out.
  - Task comment, due-date, and status notifications now use follower-aware fan-out while excluding the triggering actor.
  - Project status updates now emit `status` inbox notifications with `sourceType: 'project_status_update'` for followers in addition to existing mention notifications.
