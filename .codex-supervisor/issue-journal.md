# Issue #315: P0: Validate dueFrom and dueTo query parameters in task list API

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/315
- Branch: codex/reopen-issue-315
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-315
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-315/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: b1013fd13c9780b881bd1b280d95159efed32e8b
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T12:08:22.998Z

## Latest Codex Summary
- Reproduced issue #315 with a focused integration test: `GET /projects/:id/tasks?dueFrom=2026-03-10T12:30:00` returned `200 OK` instead of `400 Bad Request`.
- Fixed task list date filter parsing to only accept `YYYY-MM-DD` or ISO8601 datetimes with an explicit timezone, and added a matching valid-case integration test.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The runtime gap was caused by permissive query parsing in `GET /projects/:id/tasks`; timezone-less datetimes passed through `new Date(...)` and were accepted.
- Primary failure or risk: Query filters are now strict for `dueFrom`/`dueTo`; broader coverage beyond the focused integration tests has not been rerun yet.
- Last focused command: `SEARCH_ENABLED=false DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts -t "GET /projects/:id/tasks" --reporter=dot`
- Files changed: `apps/core-api/src/common/date-validation.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, `apps/core-api/test/core.integration.test.ts`
- Next 1-3 actions:
  1. Commit the focused `dueFrom`/`dueTo` validation fix on `codex/reopen-issue-315`.
  2. Decide whether to run a wider `core-api` integration slice or stop at the focused verification for this issue.
  3. Open or update a draft PR if the branch has no PR yet.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed local setup in this worktree:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/shared-types build`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `docker compose -f infra/docker/docker-compose.yml up -d postgres`
- Focused reproduction:
  - Added `GET /projects/:id/tasks rejects timezone-less due date query values` to `apps/core-api/test/core.integration.test.ts`.
  - Reproduced with `expected 400 "Bad Request", got 200 "OK"` for `dueFrom=2026-03-10T12:30:00`.
- Current focused verification passing:
  - `DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api prisma:migrate`
  - `SEARCH_ENABLED=false DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts -t "GET /projects/:id/tasks" --reporter=dot`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Added `parseTaskDateQuery()` in `apps/core-api/src/common/date-validation.ts` to accept only `YYYY-MM-DD` or ISO8601 datetimes with `Z` / `±HH:MM`.
  - `TasksController.list()` now validates `dueFrom` / `dueTo` before building the Prisma `dueAt` filter.
  - Added a valid integration test covering date-only `dueFrom` and timezone-qualified `dueTo`.
