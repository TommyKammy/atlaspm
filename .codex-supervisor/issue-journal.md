# Issue #323: P1: Implement structured redaction in global error logging

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/323
- Branch: codex/reopen-issue-323
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-323
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-323/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: a6de13296bde55d2b7f5b4f1badc47d04ddcd83f
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T13:40:58.434Z

## Latest Codex Summary
- Reproduced issue #323 with a focused `GlobalErrorFilter` unit test that showed raw `password`, `token`, `access_token`, `accessToken`, and `apiKey` values were logged from nested request data.
- Added recursive structured redaction for error-log `body`, `query`, and `params`, preserving method, correlation ID, and route/path context.
- Focused verification now passes after bootstrapping this worktree (`pnpm install`, shared package builds, Prisma client generation).

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Only the global error filter needed change; request start/end logging was out of scope for #323.
- Primary failure or risk: The error filter previously logged raw request payload data on unexpected exceptions. Current patch addresses `body`, `query`, and `params`, but no integration-level coverage was added.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
- Files changed: `apps/core-api/src/common/error.filter.ts`, `apps/core-api/src/common/log-redaction.ts`, `apps/core-api/test/error.filter.test.ts`
- Next 1-3 actions:
  1. Commit the focused redaction change on `codex/reopen-issue-323`.
  2. Push the branch and open or update a draft PR for issue #323.
  3. Decide whether request-start logging also needs redaction in the parent epic, since it still logs raw query values outside the global error path.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed local setup in this worktree:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/shared-types build`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
- Focused reproduction:
  - Added `apps/core-api/test/error.filter.test.ts`.
  - Reproduced with raw sensitive values present in the logged object for nested `password`, `token`, `access_token`, `accessToken`, and `apiKey` fields.
- Current focused verification passing:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/error.filter.test.ts test/request-logging.middleware.test.ts --reporter=dot`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Added `redactLogData()` in `apps/core-api/src/common/log-redaction.ts` to recursively redact sensitive keys while preserving object/array shape.
  - `GlobalErrorFilter` now redacts `req.body`, `req.query`, and `req.params` before logging unexpected errors.
  - The error log now includes a `route` field and uses route/path context rather than relying only on the raw URL field name.
