# Issue #371: P4: Add regression coverage for integration auth and sync behavior

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/371
- Branch: codex/reopen-issue-371
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-371
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-371/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 6c9fbedeaaf35c83a73f59d3b41e73e92b01186f
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-11T03:32:28.825Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### 2026-03-11 Codex Sync Failure Observability Coverage
- Hypothesis:
  - The GitHub reference-provider flow covered connect and happy-path sync, but it did not lock in failure observability for sync execution.
- Focused reproduction:
  - Expanded `apps/core-api/test/github-issues.integration.test.ts` with a mocked upstream `500` on the issues endpoint.
  - First focused run: `pnpm --filter @atlaspm/core-api exec vitest run test/github-issues.integration.test.ts`
  - Initial environment failures in this worktree:
    - `Command "vitest" not found` before `pnpm install`
    - missing Prisma client before `pnpm --filter @atlaspm/core-api prisma:generate`
    - unresolved `@atlaspm/domain` entry before `pnpm --filter @atlaspm/domain build`
  - Behavioral repro after environment setup:
    - The new test showed `IntegrationRuntimeService` already persisted a sanitized `FAILED` sync state, but `IntegrationsService.triggerSync()` emitted no `integration.sync.failed` audit or outbox record.
- Implementation:
  - Updated `apps/core-api/src/integrations/integrations.service.ts` to catch runtime sync failures, serialize the sanitized error, append `integration.sync.failed` audit/outbox records, and rethrow the original error.
  - Added API-level regression coverage in `apps/core-api/test/github-issues.integration.test.ts` for failed sync state persistence plus failure audit/outbox observability.
- Verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/github-issues.integration.test.ts` (failed first on missing failure audit/outbox)
  - `pnpm --filter @atlaspm/core-api exec vitest run test/github-issues.integration.test.ts`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/github-issues.integration.test.ts test/integration-runtime.service.test.ts test/integration-credentials.service.test.ts test/integration-provider.registry.test.ts test/integration-contracts.test.ts`
  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `git diff --check`
- Current outcome:
  - Failed manual sync attempts now leave behind both sanitized sync-state persistence and matching audit/outbox observability records.
  - The GitHub reference-provider integration suite now guards the failure path alongside connect, duplicate-key, and auth-cleanup behavior.
- Failure signature:
  - `missing-integration-sync-failure-audit`
- Next actions:
  - Extend the reference-provider suite with retry/partial-sync coverage on top of this failure-path baseline.

### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.

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
