# Issue #347: P2: Extend notification fan-out to task and project followers

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/347
- Branch: codex/reopen-issue-347
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-347
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-347/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: c6005131f74acc27c37c56ca5d78fc59c0b492d3
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zTr7h|PRRT_kwDORWcwRc5zTr79
- Repeated failure signature count: 1
- Updated at: 2026-03-10T13:47:22.949Z

## Latest Codex Summary
Implemented follower-aware inbox fan-out in `core-api` and proved it with a focused integration test. Task comments, due-date changes, and status changes now fan out to task followers plus the assignee with duplicate suppression, and project status updates now fan out to project followers while preserving existing mention notifications. The focused regression is in [core.integration.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-347/apps/core-api/test/core.integration.test.ts), and the routing changes are in [notifications.service.ts](/home/tommy/Dev/atlaspm-worktrees/issue-347/apps/core-api/src/notifications/notifications.service.ts), [task-comments.service.ts](/home/tommy/Dev/atlaspm-worktrees/issue-347/apps/core-api/src/tasks/task-comments.service.ts), [tasks.controller.ts](/home/tommy/Dev/atlaspm-worktrees/issue-347/apps/core-api/src/tasks/tasks.controller.ts), and [project-status-updates.controller.ts](/home/tommy/Dev/atlaspm-worktrees/issue-347/apps/core-api/src/projects/project-status-updates.controller.ts).

Reproduction was tightened first, then fixed. The initial behavioral failure was a follower-only task comment recipient getting zero notifications. The branch is committed as `c600513` and pushed, and draft PR [#351](https://github.com/TommyKammy/atlaspm/pull/351) is open.

Summary: Added focused follower notification fan-out for task comments/due-date/status events and project status updates, with dedupe and a reproducing integration test.
State hint: draft_pr
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api build`; `SEARCH_ENABLED=${SEARCH_ENABLED:-false} DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization|project status updates fan out mention notifications and include mention context for reminder hooks|task comments and project status updates notify followers without duplicate delivery'`
Failure signature: none
Next action: Monitor draft PR #351 and, if broader confidence is needed, add a focused regression for follower fan-out from adjacent task reschedule/schedule mutation routes.

## Active Failure Context
- Category: review
- Summary: 2 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/351#discussion_r2911870166
- Details:
  - apps/core-api/src/projects/project-status-updates.controller.ts:159 When a user is both mentioned in the status update summary/blockers/nextSteps and is a project follower, they will receive two separate inbox notifications for the same status update: one `mention` type and one `status` type. The `fanOutProjectStatusUpdateNotification` call does not receive `mentionedUserIds` to exclude from its recipient set. Depending on the desired UX, consider passing `mentionedUserIds` into `fanOutProjectStatusUpdateNotification` (and adding them to `excludeUserIds`) so that mentioned followers only receive the higher-priority mention notification rather than both.
  - apps/core-api/test/core.integration.test.ts:1503 The test covers follower fan-out for task comments and project status updates, but the PR also changes the due-date and status-change notification paths (`fanOutDueDateNotification` and `fanOutStatusChangeNotification`). Consider adding assertions that verify a task follower receives a notification when the task's due date or status changes, to ensure those fan-out paths work correctly and guard against regressions.

## Codex Working Notes
### Current Handoff
- Hypothesis: The configured review threads were both valid: project status follower fan-out needed mention-recipient exclusion, and the focused regression needed explicit task due-date/status follower assertions.
- Primary failure or risk: The review follow-ups are passing locally; remaining risk is limited to any new review feedback or CI drift after the update is pushed.
- Last focused command: `SEARCH_ENABLED=${SEARCH_ENABLED:-false} DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization|task comments and project status updates notify followers without duplicate delivery|project status updates fan out mention notifications and include mention context for reminder hooks'`
- Files changed: `apps/core-api/src/notifications/notifications.service.ts`, `apps/core-api/src/projects/project-status-updates.controller.ts`, `apps/core-api/src/tasks/task-comments.service.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, and `apps/core-api/test/core.integration.test.ts`
- Next 1-3 actions:
  1. Commit the review follow-up fixes on `codex/reopen-issue-347`.
  2. Push the branch and resolve review threads `PRRT_kwDORWcwRc5zTr7h` and `PRRT_kwDORWcwRc5zTr79`.
  3. Monitor PR #351 for any additional review or CI movement.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added a focused integration test covering a follower-only task comment recipient, a follower+assignee dedupe case, and a follower-only project status update recipient.
  - Fresh-worktree setup required `pnpm install`, `pnpm --filter @atlaspm/core-api exec prisma generate`, `pnpm --filter @atlaspm/core-api exec prisma migrate deploy`, and `pnpm --filter @atlaspm/domain build` before behavior tests could run.
  - The first real behavior failure was `expected [] to have a length of 1 but got +0` for the follower-only task comment notification assertion.
- Review follow-up:
  - Excluded `mentionedUserIds` from project follower `status` fan-out so a mentioned follower only receives the higher-priority `mention` notification.
  - Extended the focused integration test to cover task follower delivery for `due_date` and `status` notifications, plus the mention-vs-follower dedupe case on project status updates.
- Failure signature:
  - `PRRT_kwDORWcwRc5zTr7h|PRRT_kwDORWcwRc5zTr79`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api build`
  - `SEARCH_ENABLED=${SEARCH_ENABLED:-false} DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization|task comments and project status updates notify followers without duplicate delivery|project status updates fan out mention notifications and include mention context for reminder hooks'`
- Implementation notes:
  - Added centralized recipient collection in `NotificationsService` for task followers plus assignee dedupe and for project follower fan-out.
  - Task comment, due-date, and status notifications now use follower-aware fan-out while excluding the triggering actor.
  - Project status updates now emit `status` inbox notifications with `sourceType: 'project_status_update'` for followers in addition to existing mention notifications, but skip users already covered by the mention fan-out for the same update.
