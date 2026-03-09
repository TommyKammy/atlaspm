# Issue #286: P5-3: Add operational hardening for migrations, jobs, and observability

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/286
- Branch: codex/reopen-issue-286
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-286
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-286/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: f43ae534d58285d1908a0d7a7ac522618e95fefc
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T02:30:47.466Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Operators lacked two concrete diagnostics: request-start logs were missing `userId`, and startup had no explicit Prisma migration-health preflight to surface pending/failed migrations with recovery guidance.
- Primary failure or risk: `RequestLoggingMiddleware` emitted `http.request.start` without `userId`; `PrismaService` connected without checking `_prisma_migrations`, so failed/pending migrations were not summarized at startup.
- Last focused command: `cd /home/tommy/Dev/atlaspm-worktrees/issue-286/apps/core-api && pnpm type-check`
- Files changed: `apps/core-api/src/common/request-logging.middleware.ts`, `apps/core-api/src/prisma/prisma.service.ts`, `apps/core-api/src/prisma/migration-health.ts`, `apps/core-api/test/request-logging.middleware.test.ts`, `apps/core-api/test/migration-health.test.ts`
- Next 1-3 actions:
  1. Commit the observability + migration-health checkpoint.
  2. Decide whether to extend the same hardening pattern to job worker completion/failure summaries.
  3. If continuing, add the next narrow reproducer around job failure diagnostics.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduced with `pnpm exec vitest run test/request-logging.middleware.test.ts` after installing dependencies; failure showed missing `userId` on `http.request.start`.
- Focused verification now passing:
  - `cd apps/core-api && pnpm exec vitest run test/request-logging.middleware.test.ts test/migration-health.test.ts`
  - `cd apps/core-api && pnpm prisma:generate`
  - `cd apps/core-api && pnpm type-check`
