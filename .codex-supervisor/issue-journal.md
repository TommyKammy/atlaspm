# Issue #341: P2: Extract task feature slices into dedicated controllers and services

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/341
- Branch: codex/reopen-issue-341
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-341
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-341/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 0a2d05e78bc077b6fbae4a23318ea39851d0afc9
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zSh8C|PRRT_kwDORWcwRc5zSh8j
- Repeated failure signature count: 1
- Updated at: 2026-03-10T12:40:30.478Z

## Latest Codex Summary
Extracted the `comments + mentions` slice out of `TasksController` into a dedicated controller/service pair and shared mention-sync service. `TasksController` now keeps description updates but delegates mention sync through the shared service, so audit/outbox behavior stays aligned with the extracted comment routes.

Added focused slice tests plus light controller/service tests, then reran the existing integration flow that exercises comments/mentions. The broad integration test needed a higher timeout when run in isolation, but it passed once rerun with `--testTimeout=20000`. Checkpoint commit: `0a2d05e` (`Extract task comments slice`).

Summary: Extracted task comments and mentions into dedicated controller/services with focused tests and preserved end-to-end behavior.
State hint: implementing
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/core-api prisma:generate`; `pnpm --filter @atlaspm/domain build`; `pnpm --filter @atlaspm/core-api exec vitest run test/task-comments-slice.test.ts test/task-comments.controller.test.ts test/task-comments.service.test.ts`; `pnpm --filter @atlaspm/core-api test -- --testNamePattern='project/member/sections/tasks/rules/reorder/audit/outbox flow'` (timed out at default 5s); `pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='project/member/sections/tasks/rules/reorder/audit/outbox flow' --testTimeout=20000`
Failure signature: none
Next action: Open or update the draft PR with commit `0a2d05e` and this extracted comments/mentions slice summary.

## Active Failure Context
- Category: review
- Summary: 2 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/344#discussion_r2911466734
- Details:
  - apps/core-api/src/tasks/task-comments.service.ts:60 `listComments` adds `include: { task: { select: { projectId: true } } }`, but the returned `comment.task` data is never used when building the response. This causes an unnecessary join / extra payload on every comments list query; consider removing the `include` (or using it in place of the separate `task.findFirstOrThrow` if that was the intent).
  - apps/core-api/test/task-comments-slice.test.ts:20 This slice-extraction test asserts route movement via exact string matches like `@Get('tasks/:id/comments')`. That makes the test brittle to harmless formatting changes (quote style, spacing, decorator ordering) and can create noisy failures during refactors. Consider using a regex that's tolerant to quoting/whitespace, or (more robust) asserting via a lightweight TypeScript AST parse for the relevant decorators.

## Codex Working Notes
### Current Handoff
- Hypothesis: The safest first extraction for #341 is the `comments + mentions` slice because it has a small API surface, existing integration coverage, and one shared dependency seam for mention sync.
- Primary failure or risk: The remaining risk was limited to the two bot review comments: one legitimate unnecessary join in `TaskCommentsService.listComments`, and one legitimate brittleness issue in the slice-structure test.
- Last focused command: `pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='project/member/sections/tasks/rules/reorder/audit/outbox flow' --testTimeout=20000`
- Files changed: `apps/core-api/src/app.module.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, `apps/core-api/src/tasks/task-comments.controller.ts`, `apps/core-api/src/tasks/task-comments.service.ts`, `apps/core-api/src/tasks/task-mentions.service.ts`, and `apps/core-api/test/task-comments*.test.ts`
- Next 1-3 actions:
  1. Commit the review follow-up fixes for the unused join and regex-tolerant slice test.
  2. Push the branch and resolve the two automated review threads on PR #344.
  3. Re-check PR merge state after GitHub refreshes branch status.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `apps/core-api/test/task-comments-slice.test.ts` first so the branch failed on routes still being owned by `TasksController` and on missing dedicated controller/service wiring.
  - Initial failure: `prisma: not found` from `pnpm --filter @atlaspm/core-api test -- --run apps/core-api/test/task-comments-slice.test.ts` because the worktree had no installed dependencies.
  - After `pnpm install`, the focused slice test failed as intended on `@Get('tasks/:id/comments')` still existing in `apps/core-api/src/tasks/tasks.controller.ts`.
- Failure signature:
  - `PRRT_kwDORWcwRc5zSh8C|PRRT_kwDORWcwRc5zSh8j`
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
  - Review follow-up: removed the unused `include.task` join from `TaskCommentsService.listComments`.
  - Review follow-up: replaced exact decorator string checks in `task-comments-slice.test.ts` with quote/whitespace-tolerant regex matching to reduce false failures during harmless formatting changes.
