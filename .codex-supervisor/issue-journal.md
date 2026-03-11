# Issue #369: P4: Implement provider auth, sync-state, and job orchestration infrastructure

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/369
- Branch: codex/reopen-issue-369
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-369
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-369/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 592ab503f4fd8bdd19be3182c1d8938aaa72c12e
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zeC_6|PRRT_kwDORWcwRc5zeDAF|PRRT_kwDORWcwRc5zeDAK
- Repeated failure signature count: 1
- Updated at: 2026-03-11T02:33:56.541Z

## Latest Codex Summary
Implemented a focused runtime slice for issue #369 and committed it as `592ab50` (`Add integration runtime orchestration service`).

The new service is [`apps/core-api/src/integrations/integration-runtime.service.ts`](/home/tommy/Dev/atlaspm-worktrees/issue-369/apps/core-api/src/integrations/integration-runtime.service.ts). It adds shared provider auth status persistence plus persisted sync lifecycle orchestration with duplicate in-flight scope skipping, success/failure state updates, `lastSyncedAt` tracking, and sanitized error logging/persistence. It is wired through [`apps/core-api/src/integrations/integrations.module.ts`](/home/tommy/Dev/atlaspm-worktrees/issue-369/apps/core-api/src/integrations/integrations.module.ts), and the focused repro/coverage lives in [`apps/core-api/test/integration-runtime.service.test.ts`](/home/tommy/Dev/atlaspm-worktrees/issue-369/apps/core-api/test/integration-runtime.service.test.ts).

I first reproduced the gap with the new focused test failing on a missing runtime service, then implemented the smallest runtime needed and re-verified the existing contract/registry/Slack coverage. The issue journal was updated in [`.codex-supervisor/issue-journal.md`](/home/tommy/Dev/atlaspm-worktrees/issue-369/.codex-supervisor/issue-journal.md).

Summary: Added shared integration runtime orchestration for auth status and sync-state persistence, with focused tests and a checkpoint commit `592ab50`.
State hint: stabilizing
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/core-api prisma:generate`; `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts`; `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts test/integration-provider.registry.test.ts test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`; `pnpm --filter @atlaspm/core-api lint`; `pnpm --filter @atlaspm/core-api type-check`; `git diff --check`
Failure signature: none
Next action: extend the runtime with first-class credential storage/rotation primitives and hook it into provider management flows if issue #369 is meant to cover token persistence beyond lifecycle orchestration

## Active Failure Context
- Category: review
- Summary: 3 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/376#discussion_r2915506267
- Details:
  - apps/core-api/src/integrations/integration-runtime.service.ts:216 In the error path you log/persist a sanitized message, but then rethrow the original `error`. The GlobalErrorFilter logs `exception.message` and `exception.stack` without redaction, so a provider error containing tokens/secrets in its message/stack can still leak to logs. Consider throwing a new error with the sanitized message (and optionally keep the original as a non-logged `cause`), or otherwise ensure the thrown error is also sanitized before it reaches the global logger. ```suggestion const sanitizedException: Error & { code?: string; cause?: unknown } = new Error( sanitizedError.message, ); sanitizedException.code = sanitizedError.code; sanitizedException.cause = error; throw sanitizedException; ```
  - apps/core-api/src/integrations/integration-runtime.service.ts:164 The success-state update clears `lastSyncedAt` when the provider returns anything other than `'completed'` (including `'queued'` and `'not_supported'`). That will erase the last known successful sync time, which is usually needed for observability. Also, mapping `'queued'` to DB status `IDLE` makes the “already running” guard ineffective for queued/asynchronous syncs. Suggestion: only set `lastSyncedAt` when completed (leave it unchanged otherwise), and treat `'queued'` as an in-flight state (e.g., keep status RUNNING and avoid setting `finishedAt` yet).
  - apps/core-api/src/integrations/integration-runtime.service.ts:109 The duplicate in-flight guard is not concurrency-safe: two workers can both read a non-RUNNING state via `findUnique()` and then both proceed to `upsert()` + execute `provider.sync()`. To make the “only one RUNNING per (providerConfigId, scope)” guarantee real, claim the job atomically (e.g., a transaction that does an `updateMany` with a WHERE that only matches when status != RUNNING or startedAt is stale, and only continue when `count===1`, or use a DB advisory lock keyed by providerConfigId/scope).

## Codex Working Notes
### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.

  - PR #375 lint failed on a narrow ESLint rule violation introduced in `SlackIntegrationProvider`, not on a broader contract or schema regression.
- CI failure reproduced from GitHub Actions:
  - `gh run view 22933011586 --job 66558412518 --log`
  - Failure was:
    - `apps/core-api/src/integrations/slack.provider.ts`
    - `84:19  error  '_context' is defined but never used`
    - `91:14  error  '_context' is defined but never used`
- Local reproduction:
  - `pnpm --filter @atlaspm/core-api lint`
  - Reproduced the same two `@typescript-eslint/no-unused-vars` errors in `apps/core-api/src/integrations/slack.provider.ts`.
- Fix:
  - Kept the interface-conformant `context` parameters in `SlackIntegrationProvider.authorize` and `SlackIntegrationProvider.sync`.
  - Marked them intentionally unused with `void context;` so ESLint passes without weakening the signature.
- Verification:
  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm lint`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`
  - `git diff --check`
- Current outcome:
  - The local lint failure matching PR #375 is fixed.
  - Focused integration contract and Slack webhook tests still pass after the lint-only repair.
- Failure signature:
  - `lint-unused-context-params`
- Next actions:
  - Commit the lint repair and push/update PR #375 so GitHub Actions reruns the previously failing lint job.

### 2026-03-11 Codex Review Follow-up
- Hypothesis:
  - Both automated review comments were valid behavior gaps rather than stylistic preferences.
- Review items addressed:
  - `apps/core-api/src/integrations/integration-provider.registry.ts`
    - Added duplicate provider-key detection in the registry constructor.
    - The registry now throws `Duplicate integration provider key detected: <key>` instead of silently overwriting an earlier provider.
  - `apps/core-api/src/integrations/slack.provider.ts`
    - Updated Slack `message` mention detection to look for `<@SLACK_BOT_USER_ID>` first, with `@AtlasPM` retained as a fallback for display-name mentions.
- Tests added/updated:
  - Added `apps/core-api/test/integration-provider.registry.test.ts` to prove duplicate provider keys fail fast.
  - Expanded `apps/core-api/test/slack-webhook-signature.test.ts` with a `message` event using `<@UATLASPM>` to prove Slack mention-by-id handling.
- Verification:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-provider.registry.test.ts test/slack-webhook-signature.test.ts test/integration-contracts.test.ts`
  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm lint`
  - `git diff --check`
- Current outcome:
  - The registry fails fast on duplicate provider registration.
  - Slack message events now recognize the standard `<@USERID>` mention format.
- Failure signature:
  - `PRRT_kwDORWcwRc5zd2ud|PRRT_kwDORWcwRc5zd2us`
- Next actions:
  - Commit and push the review fixes, then resolve or respond to the two review threads on PR #375.

### 2026-03-11 Codex Runtime Infrastructure
- Hypothesis:
  - The shared provider contract existed, but `core-api` still lacked a concrete runtime service for auth status persistence and retry-safe sync-state orchestration.
- Focused reproduction:
  - Added `apps/core-api/test/integration-runtime.service.test.ts`.
  - First focused run: `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts`
  - Initial setup failure: `Command "vitest" not found` before `pnpm install`.
  - Repro after install: the focused test failed because `apps/core-api/src/integrations/integration-runtime.service.ts` did not exist.
  - Follow-up environment failure: the focused run required `pnpm --filter @atlaspm/core-api prisma:generate` because the local Prisma client was not yet generated.
  - Intermediate behavior failure: the duplicate-run guard test used a stale `startedAt`, which the new service correctly treated as reclaimable rather than in-flight.
- Implementation:
  - Added `apps/core-api/src/integrations/integration-runtime.service.ts`.
  - Implemented `authorizeProvider` to delegate provider auth and persist `IntegrationProviderConfig.status`.
  - Implemented `runSyncJob` to persist RUNNING/SUCCEEDED/FAILED sync lifecycle state, skip duplicate in-flight scopes, and record last successful sync timestamps.
  - Added structured runtime logging with basic secret/token redaction for persisted/logged error messages.
  - Registered and exported `IntegrationRuntimeService` from `apps/core-api/src/integrations/integrations.module.ts`.
- Verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts` (failed: missing service file)
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts test/integration-provider.registry.test.ts test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`
  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `git diff --check`
- Current outcome:
  - `core-api` now has a shared runtime service backing provider auth and sync lifecycle instead of only schema/contracts.
  - Duplicate in-flight sync execution for the same provider scope is skipped from persisted state.
  - Successful syncs now persist `lastSyncedAt`, and failures persist sanitized error details.
- Failure signature:
  - `missing-integration-runtime-service`
- Next actions:
  - Extend the runtime with first-class credential storage/rotation helpers if the next slice needs managed token persistence instead of external secret references only.

### 2026-03-11 Codex Review Fixes for PR #376
- Hypothesis:
  - All three configured-bot review threads on `IntegrationRuntimeService` were valid behavioral issues, not false positives.
- Review items addressed:
  - `apps/core-api/src/integrations/integration-runtime.service.ts`
    - Replaced the non-atomic `findUnique()` duplicate-run check with an atomic claim flow: ensure the sync-state row exists, then `updateMany()` it to `RUNNING` only when the existing row is not actively running or is stale.
    - Changed queued sync handling so provider results with `status: 'queued'` remain persisted as `RUNNING`, preserving in-flight protection for async jobs.
    - Stopped clearing `lastSyncedAt` for non-completed sync results; only completed syncs now update the last-success timestamp.
    - Stopped rethrowing raw provider exceptions after sanitizing persistence/log output; the runtime now throws a sanitized error carrying the original error only as `cause`.
- Tests added/updated:
  - Expanded `apps/core-api/test/integration-runtime.service.test.ts` to cover:
    - atomic duplicate-run skipping via claim failure
    - queued syncs remaining `RUNNING` without clearing prior success data
    - sanitized rethrow behavior for provider errors containing secret/token material
- Verification:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts test/integration-provider.registry.test.ts test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`
  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `git diff --check`
- Current outcome:
  - The runtime no longer leaks raw provider exception text into the global error logger path.
  - Async queued syncs keep their in-flight lock semantics and do not erase the last successful sync timestamp.
  - Sync claim logic is now concurrency-safe at the row-update level instead of depending on a racy read-before-write check.
- Failure signature:
  - `PRRT_kwDORWcwRc5zeC_6|PRRT_kwDORWcwRc5zeDAF|PRRT_kwDORWcwRc5zeDAK`
- Next actions:
  - Commit, push, and resolve the three configured-bot review threads on PR #376.
