# Issue #381: P4: Define guest identity, membership, and invitation contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/381
- Branch: codex/reopen-issue-381
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-381
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-381/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 913aacbdba4fc39f49e1126e42e1810756eebd49
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-11T12:46:36.683Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.

### 2026-03-11 Codex Guest Access Contract Definition
- Hypothesis:
  - Issue #381 is a contract-definition slice. The repo already had internal workspace invitations, but no explicit guest identity, guest-scoped access entity, or guest invitation contract.
- Focused reproduction:
  - Added `apps/core-api/test/guest-access-contracts.test.ts`.
  - First focused run: `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts`
  - Initial environment failure: `Command "vitest" not found` before local dependency install.
  - Repro after install: the focused test failed because `schema.prisma` lacked guest access models, `apps/core-api/src/guest-access/guest-access.contract.ts` did not exist, and `docs/guest-access-contract.md` did not exist.
  - Follow-up environment failures: `prisma validate` needed `DATABASE_URL`, and `type-check` needed `pnpm --filter @atlaspm/core-api prisma:generate` in this fresh worktree.
- Implementation:
  - Added guest contract coverage in `apps/core-api/test/guest-access-contracts.test.ts`.
  - Added Prisma contract definitions for `GuestInvitation`, `GuestAccessGrant`, `GuestAccessScopeType`, and `GuestAccessStatus` in `apps/core-api/prisma/schema.prisma`.
  - Added matching migration scaffold at `apps/core-api/prisma/migrations/20260311125000_guest_access_contract/migration.sql`.
  - Added `apps/core-api/src/guest-access/guest-access.contract.ts` with explicit identity/scope types plus invitation state derivation helpers.
  - Added `docs/guest-access-contract.md` and linked it from `docs/architecture.md`.
- Verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts` (failed: missing guest contract definitions)
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts`
  - `DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api prisma:generate`
  - `DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api exec prisma validate`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts test/integration-contracts.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api lint`
  - `git diff --check`
- Current outcome:
  - Guest identity mapping, scoped guest access entities, and invitation lifecycle semantics are now explicit in `core-api` contracts and docs.
  - The contract states that guest acceptance maps into the existing `User` row and grants scoped access via `GuestAccessGrant`, not `WorkspaceMembership`.
- Failure signature:
  - `missing-guest-access-contract`
- Next actions:
  - Decide whether the next slice should wire guest invitation/grant runtime endpoints onto these contracts or keep this issue scoped to contract definition only.



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
