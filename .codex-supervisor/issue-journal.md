# Issue #323: P1: Implement structured redaction in global error logging

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/323
- Branch: codex/reopen-issue-323
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-323
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-323/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 1ddea9a7288da8f0745d47a1f5bec579b94d4697
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zBtCd|PRRT_kwDORWcwRc5zBtC2|PRRT_kwDORWcwRc5zBtDK
- Repeated failure signature count: 1
- Updated at: 2026-03-09T13:51:30.505Z

## Latest Codex Summary
Implemented the focused fix on `codex/reopen-issue-323` in commit `1ddea9a7288da8f0745d47a1f5bec579b94d4697`.

The reproducer is [error.filter.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-323/apps/core-api/test/error.filter.test.ts), which originally failed because [error.filter.ts](/home/tommy/Dev/atlaspm-worktrees/issue-323/apps/core-api/src/common/error.filter.ts) logged raw nested secrets. The fix adds [log-redaction.ts](/home/tommy/Dev/atlaspm-worktrees/issue-323/apps/core-api/src/common/log-redaction.ts) and routes unexpected-error logging through it, so `body`, `query`, and `params` are recursively redacted while preserving shape, method, correlation ID, and route/path context.

Verification passed after bootstrapping this worktree with `pnpm install`, `pnpm --filter @atlaspm/domain build`, `pnpm --filter @atlaspm/shared-types build`, and `pnpm --filter @atlaspm/core-api prisma:generate`. I then ran `pnpm --filter @atlaspm/core-api exec vitest run test/error.filter.test.ts test/request-logging.middleware.test.ts --reporter=dot` and `pnpm --filter @atlaspm/core-api type-check`.

Summary: Added recursive redaction to global unexpected-error logging, with a focused failing-then-passing unit test.
State hint: stabilizing
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api exec vitest run test/error.filter.test.ts test/request-logging.middleware.test.ts --reporter=dot`; `pnpm --filter @atlaspm/core-api type-check`
Failure signature: none
Next action: Push `codex/reopen-issue-323` and open or update a draft PR for issue #323

## Active Failure Context
- Category: review
- Summary: 3 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/326#discussion_r2905556418
- Details:
  - apps/core-api/src/common/log-redaction.ts:13 The issue acceptance criteria explicitly lists `email` and `invite` as sensitive keys that must be redacted ("Recursively mask sensitive keys such as `token`, `authorization`, `password`, `secret`, `email`, `invite`, and attachment/access tokens"), but neither is present in `SENSITIVE_KEY_PATTERNS`. The test also confirms this gap — it asserts that `email: 'user@example.com'` remains unredacted in the log output (line 75), which contradicts the issue requirements. Both `email` and `invite` patterns should be added to `SENSITIVE_KEY_PATTERNS` and the test should be updated to reflect their redaction.
  - apps/core-api/src/common/error.filter.ts:48 The log object now has both `path` and `route` set to the exact same value (`route = req.route?.path ?? req.path ?? req.url`). The original `path` field was `req.url` (raw URL), while the new `route` field provides the Express route template (e.g., `/projects/:id/tasks`). Emitting both as the same value is redundant. Consider keeping `route` for the Express route template and reverting `path` to `req.url` so that the two fields carry distinct, complementary information (the parametrised route and the actual request URL).
  - apps/core-api/test/error.filter.test.ts:75 The test asserts `email: 'user@example.com'` is not redacted (line 75). This directly contradicts the issue's acceptance criteria which requires `email` to be masked. If (as noted in the `SENSITIVE_KEY_PATTERNS` comment) `email` is intentionally left unredacted, this should at minimum be documented with a comment explaining the decision. As written, the test confirms a gap, not a passing requirement.

## Codex Working Notes
### Current Handoff
- Hypothesis: The configured-bot review was correct; `email` and invite-related keys also need redaction, and `path` should remain distinct from the route template.
- Primary failure or risk: Current patch still only covers the global error filter path, which matches issue scope; request start logging remains unchanged by design.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
- Files changed: `apps/core-api/src/common/error.filter.ts`, `apps/core-api/src/common/log-redaction.ts`, `apps/core-api/test/error.filter.test.ts`
- Next 1-3 actions:
  1. Commit the review follow-up on `codex/reopen-issue-323`.
  2. Push the branch and resolve the three configured-bot threads on PR #326.
  3. Re-check PR #326 merge/check state after the update lands.

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
  - Review follow-up added `email` and invite-related key patterns, including nested `invitedEmail` and `invitationId` coverage in the regression test.
  - Review follow-up changed the log shape to keep `path` as the concrete request path and `route` as the route template when available.
