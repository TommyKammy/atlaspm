# Issue #315: P0: Validate dueFrom and dueTo query parameters in task list API

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/315
- Branch: codex/reopen-issue-315
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-315
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-315/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 0e7faef00cf467cf0aea47a404ce642850f97805
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zASEQ|PRRT_kwDORWcwRc5zASEk|PRRT_kwDORWcwRc5zASEy
- Repeated failure signature count: 1
- Updated at: 2026-03-09T12:17:32.000Z

## Latest Codex Summary
Implemented the fix on `codex/reopen-issue-315` in commit `0e7faef`.

`GET /projects/:id/tasks` now validates `dueFrom` and `dueTo` before building the Prisma filter. The accepted formats are explicit: `YYYY-MM-DD` or ISO8601 datetime with `Z` / `±HH:MM`. I added focused integration coverage for the reproduced failure (`dueFrom=2026-03-10T12:30:00` previously returned `200`) and for a valid mixed-format query. The issue journal was updated with the failure signature, commands, and current handoff.

Tests run:
- `DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api prisma:migrate`
- `SEARCH_ENABLED=false DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts -t "GET /projects/:id/tasks" --reporter=dot`
- `pnpm --filter @atlaspm/core-api type-check`

Summary: Reproduced and fixed the task list API gap so invalid `dueFrom`/`dueTo` values now return 400, with focused integration tests for invalid and valid query formats.
State hint: stabilizing
Blocked reason: none
Tests: Focused core-api integration tests for GET /projects/:id/tasks date filters, plus core-api type-check
Failure signature: dueFrom timezone-less datetime accepted with 200 in task list API
Next action: Decide whether to stop at the focused verification for issue #315 or run a wider core-api integration slice before opening/updating a draft PR

## Active Failure Context
- Category: review
- Summary: 3 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/321#discussion_r2905070351
- Details:
  - apps/core-api/src/common/date-validation.ts:76 Timezone offset validation in parseTaskDateQuery() is too permissive: it allows offsets like +23:59, which are not valid ISO8601 time zone offsets (max is ±14:00; and if ±14, minutes must be 00). Tighten the offset checks to match the supported format so invalid offsets return the intended 400 instead of being accepted and converted. ```suggestion if (offsetMins > 59 || offsetHours > 14 || (offsetHours === 14 && offsetMins !== 0)) { ```
  - apps/core-api/src/common/date-validation.ts:35 The 400 message for invalid dueFrom/dueTo values says "ISO8601 datetime with timezone", but the API only accepts explicit "Z" or "±HH:MM" offsets. Consider updating the message to mention the exact accepted timezone forms to better satisfy the "clear 400 responses" acceptance criteria. ```suggestion message: `${fieldName} must use YYYY-MM-DD or ISO8601 datetime with 'Z' or ±HH:MM timezone offset`, ```
  - apps/core-api/test/core.integration.test.ts:2456 This new 400-case integration test only asserts that `message` contains "dueFrom". Other tests in this file typically assert the structured error payload (e.g., `{ code, message }`). Consider asserting `code: 'INVALID_DATE_FORMAT'` (and a message substring) to make the test more robust and aligned with existing expectations. ```suggestion expect(res.body).toMatchObject({ code: 'INVALID_DATE_FORMAT', message: expect.stringContaining('dueFrom'), }); ```

## Codex Working Notes
### Current Handoff
- Hypothesis: The original fix was directionally correct; the remaining review items were small contract tightenings around timezone offsets, error text, and test robustness.
- Primary failure or risk: Review follow-up is implemented locally, but the branch still needs the follow-up commit pushed and the PR threads resolved.
- Last focused command: `SEARCH_ENABLED=false DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts -t "GET /projects/:id/tasks" --reporter=dot`
- Files changed: `apps/core-api/src/common/date-validation.ts`, `apps/core-api/test/core.integration.test.ts`
- Next 1-3 actions:
  1. Commit the review-follow-up changes on `codex/reopen-issue-315`.
  2. Push the branch and resolve the three configured-bot review threads on PR #321.
  3. Re-check PR #321 merge/check state after the update lands.

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
  - Review follow-up tightened timezone offsets to ISO-valid bounds (`±14:00` max, and `14` requires `00` minutes).
  - Review follow-up clarified the 400 message to name the exact accepted timezone forms and strengthened the invalid-case integration assertions to check `code: 'INVALID_DATE_FORMAT'`.
  - Added a second invalid integration assertion for `dueTo=...+14:30` so the offset-bound fix is exercised end-to-end.
