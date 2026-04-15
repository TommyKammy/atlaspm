# Issue #390: P0: Split task controller into focused task modules

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/390
- Branch: codex/issue-390
- Workspace: .
- Journal: .codex-supervisor/issues/390/issue-journal.md
- Current phase: stabilizing
- Attempt count: 3 (implementation=3, repair=0)
- Last head SHA: d82370d2f9c61415736f91974b910bfec309de8a
- Blocked reason: none
- Last failure signature: stale-stabilizing-no-pr-recovery-loop
- Repeated failure signature count: 0
- Updated at: 2026-04-15T03:38:32.791Z

## Latest Codex Summary
Extracted the dependency/subtask endpoints out of `TasksController` into [task-dependencies.controller.ts](apps/core-api/src/tasks/task-dependencies.controller.ts), wired the controller in [app.module.ts](apps/core-api/src/app.module.ts), and removed the `/tasks/:id/subtasks`, `/tasks/:id/breadcrumbs`, `/tasks/:id/dependencies`, `/tasks/:id/dependents`, `/tasks/:id/blocked`, and `/projects/:id/dependency-graph` route surface plus local DTOs from [tasks.controller.ts](apps/core-api/src/tasks/tasks.controller.ts). I also added [task-dependencies-slice.test.ts](apps/core-api/test/task-dependencies-slice.test.ts) to lock route ownership alongside the comments, attachments, and reminders slice tests.

Focused verification passed for the new slice and touched source files. Package type-check for `@atlaspm/core-api` also passed in this worktree. The remaining verification gap from earlier turns is still environmental and limited to the DB-backed reminder integration path, where `prisma migrate deploy` previously failed with `P1001` against `localhost:55432`.

Summary: Extracted dependency/subtask routes into a dedicated controller, added a dependency slice characterization test, and verified the slice with tests, lint, and package type-check.
State hint: stabilizing
Blocked reason: none
Tests: `corepack pnpm --filter @atlaspm/core-api exec vitest run test/task-comments-slice.test.ts test/task-attachments-slice.test.ts test/task-reminders-slice.test.ts test/task-dependencies-slice.test.ts` passed; `corepack pnpm --filter @atlaspm/core-api exec eslint src/tasks/task-dependencies.controller.ts src/tasks/tasks.controller.ts src/app.module.ts` passed; `corepack pnpm --filter @atlaspm/core-api type-check` passed
Next action: Commit the dependency/subtask slice checkpoint, push `codex/issue-390`, and open a draft PR so the branch stops sitting in stabilizing without review context.
Failure signature: stale-stabilizing-no-pr-recovery-loop

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: `dependencies-subtasks` is the next bounded `TasksController` seam after reminders because the business logic already lives in `SubtaskService`; extracting just the route ownership should be low-risk and reviewable.
- What changed: Added `apps/core-api/test/task-dependencies-slice.test.ts`, created `apps/core-api/src/tasks/task-dependencies.controller.ts`, wired `TaskDependenciesController` through `apps/core-api/src/app.module.ts`, and removed the dependency/subtask DTOs plus endpoints from `apps/core-api/src/tasks/tasks.controller.ts`.
- Current blocker: None for the dependency/subtask slice itself. Earlier DB-backed reminder integration remains unrerun because the local Postgres test instance on `localhost:55432` was unavailable when `prisma migrate deploy` was attempted.
- Next exact step: Stage only the task-slice files and this issue journal, commit the checkpoint, push `codex/issue-390`, and open a draft PR. After that, either resume broader verification once the test DB is available or begin the higher-coupling timeline split.
- Verification gap: Characterization coverage, touched-source lint, and `@atlaspm/core-api` package type-check all passed for this slice. No DB-backed integration path was needed for the controller move itself.
- Files touched: `apps/core-api/test/task-dependencies-slice.test.ts`, `apps/core-api/src/tasks/task-dependencies.controller.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, `apps/core-api/src/app.module.ts`.
- Rollback concern: Low; this extraction only rehomes thin transport/auth glue around `SubtaskService` and preserves the existing route paths and payload handling.
- Last focused command: `corepack pnpm --filter @atlaspm/core-api type-check`
### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
