# Issue #371: P4: Add regression coverage for integration auth and sync behavior

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/371
- Branch: codex/reopen-issue-371
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-371
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-371/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 94252b34eea187b0c08fb064fd42af25fb08050d
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zehc_|PRRT_kwDORWcwRc5zehdM|PRRT_kwDORWcwRc5zehdY
- Repeated failure signature count: 1
- Updated at: 2026-03-11T03:41:22.467Z

## Latest Codex Summary
Added a focused regression slice for sync failure observability. The new GitHub integration test in [github-issues.integration.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-371/apps/core-api/test/github-issues.integration.test.ts) now forces an upstream `500` and proves the API persists a sanitized `FAILED` sync state plus matching `integration.sync.failed` audit/outbox records. To make that pass, [integrations.service.ts](/home/tommy/Dev/atlaspm-worktrees/issue-371/apps/core-api/src/integrations/integrations.service.ts) now catches runtime sync failures, records failure observability, and rethrows.

Focused verification passed after bringing the worktree to a runnable baseline with `pnpm install`, Prisma generate, and a build of `@atlaspm/domain`. I also updated the supervisor notes in [issue-journal.md](/home/tommy/Dev/atlaspm-worktrees/issue-371/.codex-supervisor/issue-journal.md) and checkpointed the work as commit `94252b3` (`Add sync failure observability regression coverage`).

Summary: Added focused GitHub sync-failure regression coverage and implemented missing `integration.sync.failed` audit/outbox emission.
State hint: stabilizing
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/core-api prisma:generate`; `pnpm --filter @atlaspm/domain build`; `pnpm --filter @atlaspm/core-api exec vitest run test/github-issues.integration.test.ts`; `pnpm --filter @atlaspm/core-api exec vitest run test/github-issues.integration.test.ts test/integration-runtime.service.test.ts test/integration-credentials.service.test.ts test/integration-provider.registry.test.ts test/integration-contracts.test.ts`; `pnpm --filter @atlaspm/core-api lint`; `pnpm --filter @atlaspm/core-api type-check`; `git diff --check`
Failure signature: none
Next action: Extend the reference-provider coverage with retry and partial-sync regression tests on top of this new failure-path baseline

## Active Failure Context
- Category: review
- Summary: 3 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/378#discussion_r2915670853
- Details:
  - apps/core-api/src/integrations/integrations.service.ts:140 `result` is declared without a type/initializer, so it becomes `any` and weakens type-safety for the rest of `triggerSync` (e.g., `result.status`, `importedCount`). Consider typing it as `RunIntegrationSyncJobResult` (or the runtime return type) and/or initializing it inside the `try` to keep inference.
  - apps/core-api/test/github-issues.integration.test.ts:476 `failIssueSyncMessage` is mutable shared state across the whole test file (captured by the mock GitHub server). If an assertion throws before the reset, later tests can unexpectedly keep returning 500s. Consider resetting it in a `finally` block around the sync call (or in `afterEach`) to avoid cross-test contamination. ```suggestion let syncRes; try { syncRes = await request(app.getHttpServer()) .post(`/workspaces/${workspaceId}/integrations/${connectRes.body.id}/sync`) .set('Authorization', `Bearer ${token}`) .send({ scope: 'issues' }) .expect(500); expect(syncRes.body.message).toBe('Internal server error'); const syncState = await prisma.integrationSyncState.findUnique({ where: { providerConfigId_scope: { providerConfigId: connectRes.body.id as string, scope: 'issues', }, }, }); expect(syncState?.status).toBe('FAILED'); expect(syncState?.lastErrorCode).toBe('INTEGRATION_SYNC_FAILED'); expect(syncState?.lastErrorMessage).toBe('GitHub API request failed with status 500'); expect(syncState?.finishedAt).not.toBeNull(); const auditEvents = await prisma.auditEvent.findMany({ where: { entityId: connectRes.body.id as string, action: 'integration.sync.failed', }, }); expect(auditEvents).toHaveLength(1); expect(auditEvents[0]?.afterJson).toMatchObject({ scope: 'issues', status: 'failed', errorCode: 'INTEGRATION_SYNC_FAILED', errorMessage: 'GitHub API request failed with status 500', }); const outboxEvents = await prisma.outboxEvent.findMany({ where: { type: 'integration.sync.failed', payload: { path: ['providerConfigId'], equals: connectRes.body.id as string, }, }, }); expect(outboxEvents).toHaveLength(1); expect(outboxEvents[0]?.payload).toMatchObject({ providerConfigId: connectRes.body.id, workspaceId, scope: 'issues', errorCode: 'INTEGRATION_SYNC_FAILED', errorMessage: 'GitHub API request failed with status 500', }); } finally { failIssueSyncMessage = null; } ```
  - apps/core-api/test/github-issues.integration.test.ts:432 This assertion relies on Nest's default 500 response shape (`{ message: 'Internal server error' }`), but the production app installs `GlobalErrorFilter`, which returns `{ error: { message: ... } }`. To keep the regression test aligned with production (and more future-proof), consider applying `GlobalErrorFilter` in this suite and asserting against the filtered shape (or only asserting on status code here). ```suggestion ```

## Codex Working Notes
### 2026-03-11 Codex Review Fixes for PR #378
- Hypothesis:
  - All three configured-bot review comments on the new sync-failure regression slice were valid and could be fixed without changing behavior.
- Review items addressed:
  - `apps/core-api/src/integrations/integrations.service.ts`
    - Typed `result` in `triggerSync()` as `RunIntegrationSyncJobResult` instead of leaving it implicitly `any`.
  - `apps/core-api/test/github-issues.integration.test.ts`
    - Wrapped the forced failing sync request in a `try`/`finally` so `failIssueSyncMessage` is always reset, even if an assertion fails.
    - Dropped the brittle assertion on Nest's default `500` body shape and kept the regression focused on status code plus persisted/audited failure state.
- Verification:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/github-issues.integration.test.ts`
  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `git diff --check`
- Current outcome:
  - The review threads are addressed without widening the runtime behavior surface.
  - The GitHub failure-path regression no longer depends on test-order-sensitive mutable state or framework-specific default error serialization.
- Failure signature:
  - `PRRT_kwDORWcwRc5zehc_|PRRT_kwDORWcwRc5zehdM|PRRT_kwDORWcwRc5zehdY`
- Next actions:
  - Commit, push, and resolve the three review threads on PR #378.

### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.


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
