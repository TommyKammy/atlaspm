# Issue #341: P2: Extract task feature slices into dedicated controllers and services

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/341
- Branch: codex/reopen-issue-341
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-341
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-341/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 1c8889e7aedfad31f8c85b23a565256aa2424bc0
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T12:29:41.356Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The safest first extraction for #341 is the `comments + mentions` slice because it has a small API surface, existing integration coverage, and one shared dependency seam for mention sync.
- Primary failure or risk: The focused extraction test initially failed because comment and mention routes still lived in `TasksController`; the first test run also exposed missing worktree deps, and the existing broad integration flow needed a higher timeout than Vitest's 5s default.
- Last focused command: `pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='project/member/sections/tasks/rules/reorder/audit/outbox flow' --testTimeout=20000`
- Files changed: `apps/core-api/src/app.module.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, `apps/core-api/src/tasks/task-comments.controller.ts`, `apps/core-api/src/tasks/task-comments.service.ts`, `apps/core-api/src/tasks/task-mentions.service.ts`, and `apps/core-api/test/task-comments*.test.ts`
- Next 1-3 actions:
  1. Commit the extracted `comments + mentions` slice and focused tests.
  2. Open or update the issue PR with the controller/service extraction summary.
  3. Decide whether to extract the next task slice in a follow-up issue or keep #341 scoped to comments/mentions.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `apps/core-api/test/task-comments-slice.test.ts` first so the branch failed on routes still being owned by `TasksController` and on missing dedicated controller/service wiring.
  - Initial failure: `prisma: not found` from `pnpm --filter @atlaspm/core-api test -- --run apps/core-api/test/task-comments-slice.test.ts` because the worktree had no installed dependencies.
  - After `pnpm install`, the focused slice test failed as intended on `@Get('tasks/:id/comments')` still existing in `apps/core-api/src/tasks/tasks.controller.ts`.
- Failure signature:
  - `task-comments-still-in-tasks-controller`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/task-comments-slice.test.ts test/task-comments.controller.test.ts test/task-comments.service.test.ts`
  - `pnpm --filter @atlaspm/core-api test -- --testNamePattern='project/member/sections/tasks/rules/reorder/audit/outbox flow'`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='project/member/sections/tasks/rules/reorder/audit/outbox flow' --testTimeout=20000`
- Implementation notes:
  - Added `TaskCommentsController` to own `GET /tasks/:id/mentions`, `GET/POST /tasks/:id/comments`, `PATCH /comments/:id`, and `DELETE /comments/:id`.
  - Added `TaskCommentsService` for the transactional comment logic and `TaskMentionsService` for reusable mention parsing/sync so `PATCH /tasks/:id/description` keeps the same audit/outbox behavior.
  - `TasksController` now delegates description mention sync through `TaskMentionsService` and no longer owns the extracted comment/mention routes.
  - The existing broad integration flow passed once rerun with `--testTimeout=20000`; the earlier failure was timeout-only, not a behavior regression.
