# Issue #286: P5-3: Add operational hardening for migrations, jobs, and observability

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/286
- Branch: codex/reopen-issue-286
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-286
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-286/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 521c3f4d1304d654f516c66fe21ab91dbe186400
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5y6G0v|PRRT_kwDORWcwRc5y6G02|PRRT_kwDORWcwRc5y6G08|PRRT_kwDORWcwRc5y6G1B
- Repeated failure signature count: 1
- Updated at: 2026-03-09T02:40:07.433Z

## Latest Codex Summary
Added a checkpoint commit on `codex/reopen-issue-286`: `521c3f4` (`Add migration preflight and request log hardening`).

The focused reproducer was a new test proving `http.request.start` logs were missing `userId`; that is now fixed in [request-logging.middleware.ts](/home/tommy/Dev/atlaspm-worktrees/issue-286/apps/core-api/src/common/request-logging.middleware.ts). I also added a Prisma startup preflight in [migration-health.ts](/home/tommy/Dev/atlaspm-worktrees/issue-286/apps/core-api/src/prisma/migration-health.ts) and wired it through [prisma.service.ts](/home/tommy/Dev/atlaspm-worktrees/issue-286/apps/core-api/src/prisma/prisma.service.ts) so startup now logs structured migration health, warns on pending/extra migrations, and blocks startup on failed migrations with explicit recovery guidance. The new tests are in [request-logging.middleware.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-286/apps/core-api/test/request-logging.middleware.test.ts) and [migration-health.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-286/apps/core-api/test/migration-health.test.ts).

Verification was focused and clean after generating Prisma client: `pnpm exec vitest run test/request-logging.middleware.test.ts test/migration-health.test.ts`, `pnpm prisma:generate`, and `pnpm type-check`. I also updated [.codex-supervisor/issue-journal.md](/home/tommy/Dev/atlaspm-worktrees/issue-286/.codex-supervisor/issue-journal.md) with the repro, commands, and next step.

Summary: Added a reproducing test and fix for missing request-start `userId` logs, plus Prisma migration-health startup diagnostics and guardrails; committed as `521c3f4`.
State hint: implementing
Blocked reason: none
Tests: `cd apps/core-api && pnpm exec vitest run test/request-logging.middleware.test.ts test/migration-health.test.ts`; `cd apps/core-api && pnpm prisma:generate`; `cd apps/core-api && pnpm type-check`
Failure signature: none
Next action: Add the next narrow reproducer around background job failure/completion diagnostics and extend structured job observability in the same style.

## Active Failure Context
- Category: review
- Summary: 4 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/307#discussion_r2902900985
- Details:
  - apps/core-api/src/common/request-logging.middleware.ts:7 `userId` is captured before Nest guards run. In this app, `AuthGuard` sets `req.user` during `canActivate`, which happens after Express middleware registration in `main.ts`, so `userId` here will almost always be `'anonymous'` and this change will also regress the `http.request.end` log (it previously could pick up `req.user` by the time `finish` fires). Consider computing `userId` inside the `finish` callback (for the end log), and if you truly need `userId` on the start event, move the start logging to a Nest interceptor/guard that runs after authentication rather than Express middleware.
  - apps/core-api/test/request-logging.middleware.test.ts:30 This test pre-populates `request.user` before invoking the Express middleware, but in production `req.user` is populated by `AuthGuard.canActivate` (after middleware), so `http.request.start` will not see a user and this test will give false confidence. To match real behavior, start with no `user`, then set `request.user` before triggering the captured `finish` listener; assert that the end log includes the authenticated `userId` and decide whether the start log should omit `userId` or use a sentinel like `'unknown'`.
  - apps/core-api/src/prisma/prisma.service.ts:22 `inspectMigrationHealth()` can throw (e.g., missing `prisma/migrations` directory at runtime, or `_prisma_migrations` table not present / insufficient privileges). Right now any such error will crash startup without producing the structured health output you intended. Consider wrapping the migration-health probe in a try/catch that logs a clear, operator-actionable warning/error (and decide explicitly whether to fail open or fail closed for probe failures).
  - apps/core-api/src/prisma/migration-health.ts:36 This uses `$queryRawUnsafe` even though the SQL is static. Using the safe `$queryRaw` API (e.g., with `Prisma.sql`) avoids normalizing an unsafe pattern into the codebase and makes it harder to accidentally introduce SQL injection later if the query becomes parameterized.

## Codex Working Notes
### Current Handoff
- Hypothesis: The valid review fixes are to align request logging with actual Nest auth timing and to make the migration-health probe fail open with structured diagnostics while still failing closed for confirmed failed migrations.
- Primary failure or risk: Review threads identified an incorrect middleware assumption (`req.user` not available at request start), unsafe `$queryRawUnsafe` usage for a static query, and missing probe-error handling that could crash startup without actionable output.
- Last focused command: `cd /home/tommy/Dev/atlaspm-worktrees/issue-286/apps/core-api && pnpm prisma:generate && pnpm type-check`
- Files changed: `apps/core-api/src/common/request-logging.middleware.ts`, `apps/core-api/src/prisma/prisma.service.ts`, `apps/core-api/src/prisma/migration-health.ts`, `apps/core-api/test/request-logging.middleware.test.ts`, `apps/core-api/test/migration-health.test.ts`, `docs/architecture.md`
- Next 1-3 actions:
  1. Commit the review fixes for request logging and migration probe handling.
  2. Update the PR branch and resolve the automated review threads.
  3. If more review arrives, keep the next change narrowly scoped to the cited behavior.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduced with `pnpm exec vitest run test/request-logging.middleware.test.ts` after installing dependencies; failure showed missing `userId` on `http.request.start`.
- Focused verification now passing:
  - `cd apps/core-api && pnpm exec vitest run test/request-logging.middleware.test.ts test/migration-health.test.ts`
  - `cd apps/core-api && pnpm prisma:generate`
  - `cd apps/core-api && pnpm type-check`
- Review fixes applied:
  - request-start logs no longer claim `userId`; request-end still captures `req.user` after guards.
  - migration-health now uses `$queryRaw` with `Prisma.sql`.
  - startup wraps migration probe failures and emits `prisma.migrations.probe_failed` warnings instead of crashing on probe-only errors.
  - default migrations path now resolves relative to `src/prisma`/`dist/prisma`, not process cwd.
