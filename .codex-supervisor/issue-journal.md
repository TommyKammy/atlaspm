# Issue #381: P4: Define guest identity, membership, and invitation contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/381
- Branch: codex/reopen-issue-381
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-381
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-381/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 9bac93f218397e579959b69c7de7d2c4dd985662
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zlqFl|PRRT_kwDORWcwRc5zlqGU|PRRT_kwDORWcwRc5zlqGu|PRRT_kwDORWcwRc5zlqHD|PRRT_kwDORWcwRc5zlqHQ
- Repeated failure signature count: 1
- Updated at: 2026-03-11T12:58:46.409Z

## Latest Codex Summary
Added a focused reproducer and then defined the guest-access contract layer in `core-api`. The new checkpoint commit is `9bac93f` (`Define guest access contracts`).

The contract now exists in three places: Prisma schema/migration for `GuestInvitation` and `GuestAccessGrant`, a pure TypeScript contract module at [guest-access.contract.ts](/home/tommy/Dev/atlaspm-worktrees/issue-381/apps/core-api/src/guest-access/guest-access.contract.ts), and documentation at [guest-access-contract.md](/home/tommy/Dev/atlaspm-worktrees/issue-381/docs/guest-access-contract.md). The key rule is explicit: guest identities still map to the existing `User` row, and guest acceptance grants scoped access via `GuestAccessGrant`, not `WorkspaceMembership`.

Verification passed after installing deps and generating Prisma client for this fresh worktree. I also updated the issue journal with the reproduction, environment setup failures, commands, and next actions.

Summary: Added guest identity/access/invitation contract definitions with focused tests and a checkpoint commit (`9bac93f`).
State hint: implementing
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts`; `DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api prisma:generate`; `DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api exec prisma validate`; `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts test/integration-contracts.test.ts`; `pnpm --filter @atlaspm/core-api type-check`; `pnpm --filter @atlaspm/core-api lint`; `git diff --check`
Failure signature: none
Next action: Decide whether to keep #381 scoped to contract definition or wire runtime guest invitation/grant endpoints onto these new contracts.

## Active Failure Context
- Category: review
- Summary: 5 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/385#discussion_r2918205758
- Details:
  - apps/core-api/prisma/schema.prisma:391 `@@unique([userId, projectId, scopeType])` won't enforce uniqueness for WORKSPACE-scoped grants because PostgreSQL UNIQUE indexes allow multiple rows where `projectId` is NULL. This would allow duplicate WORKSPACE grants per user (and potentially break grant refresh/upsert semantics). Consider replacing this with partial unique indexes: one for PROJECT scope (e.g., userId+projectId where scopeType='PROJECT' and projectId IS NOT NULL) and one for WORKSPACE scope (e.g., userId+workspaceId where scopeType='WORKSPACE' and projectId IS NULL), added via SQL migration since Prisma can't express partial indexes. ```suggestion ```
  - apps/core-api/prisma/migrations/20260311125000_guest_access_contract/migration.sql:43 The migration creates a UNIQUE index on (user_id, project_id, scope_type), but this does not prevent duplicates when `project_id` is NULL (PostgreSQL treats NULLs as distinct). That means multiple WORKSPACE-scope grants per user could be inserted. Consider replacing this with partial unique indexes keyed by the actual scope (WORKSPACE: user_id+workspace_id WHERE scope_type='WORKSPACE' AND project_id IS NULL; PROJECT: user_id+project_id WHERE scope_type='PROJECT' AND project_id IS NOT NULL). ```suggestion CREATE UNIQUE INDEX "guest_access_grants_workspace_scope_key" ON "guest_access_grants"("user_id", "workspace_id") WHERE "scope_type" = 'WORKSPACE' AND "project_id" IS NULL; CREATE UNIQUE INDEX "guest_access_grants_project_scope_key" ON "guest_access_grants"("user_id", "project_id") WHERE "scope_type" = 'PROJECT' AND "project_id" IS NOT NULL; ```
  - apps/core-api/prisma/migrations/20260311125000_guest_access_contract/migration.sql:36 The contract/docs require scope-dependent invariants (e.g., scopeType=PROJECT requires projectId and projectRole; scopeType=WORKSPACE should not have projectId/projectRole), but the schema/migration currently allow any combination. Given this repo already adds CHECK constraints in follow-up migrations (e.g., capacity_schedules_subject_type_user_id_check), consider adding similar CHECK constraints for `guest_invitations` and `guest_access_grants` so invalid rows can’t be persisted.
  - apps/core-api/src/guest-access/guest-access.contract.ts:13 `GuestAccessScope.role` is typed as `ProjectRole`, which includes `ADMIN`, but the contract doc states guest project roles are limited to non-admin collaboration roles. To keep the contract self-consistent and prevent accidental admin grants, consider narrowing this type (e.g., a GuestProjectRole union that excludes ADMIN) and/or exporting a validation helper that enforces the restriction.
  - apps/core-api/src/guest-access/guest-access.contract.ts:32 `GuestInvitationContract` includes `acceptedByUserId` but omits `createdByUserId` even though the documented contract and Prisma model include an inviter/creator user id. If this type is intended to be the canonical invitation contract for auditability and downstream logic, consider adding `createdByUserId` (and possibly `createdAt`) so consumers don’t silently drop that linkage. ```suggestion acceptedByUserId: string | null; createdByUserId?: string; createdAt?: Date; ```

## Codex Working Notes
### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.

### 2026-03-11 Codex Review Fixes for PR #385
- Hypothesis:
  - All five configured-bot review comments on the guest access contract were valid contract hardening issues rather than false positives.
- Focused reproduction:
  - Tightened `apps/core-api/test/guest-access-contracts.test.ts` to assert:
    - the Prisma schema no longer advertises a null-sensitive guest grant uniqueness guarantee
    - the migration defines scope-aware partial unique indexes
    - the migration defines scope-dependent CHECK constraints
    - the TypeScript contract narrows guest project roles away from `ADMIN`
    - the invitation contract includes inviter metadata
  - Focused repro run: `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts`
  - Failure after tightening:
    - `schema.prisma` still contained `@@unique([userId, projectId, scopeType], ...)`
    - the migration still used the null-sensitive guest grant unique index and lacked scope CHECK constraints
    - `GuestAccessScope.role` still accepted `ProjectRole.ADMIN`
    - `GuestInvitationContract` still omitted `createdByUserId` and `createdAt`
- Implementation:
  - Added `GuestProjectRole = 'MEMBER' | 'VIEWER'` and exported `isGuestProjectRole(...)`.
  - Added `createdByUserId` and `createdAt` to `GuestInvitationContract`.
  - Removed the misleading Prisma `@@unique([userId, projectId, scopeType])` declaration and documented that SQL migration files own the guest grant uniqueness/invariant enforcement.
  - Updated the guest access migration to:
    - add `guest_invitations_scope_check`
    - add `guest_access_grants_scope_check`
    - replace the old guest grant unique index with partial unique indexes for workspace scope and project scope separately
- Verification:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts` (failed before fixes)
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts`
  - `DATABASE_URL=postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public pnpm --filter @atlaspm/core-api exec prisma validate`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-contracts.test.ts test/integration-contracts.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api lint`
  - `git diff --check`
- Current outcome:
  - Guest contract storage now encodes the scope-dependent invariants the docs describe.
  - Workspace-scope guest grants are protected against duplicate rows despite `project_id` being `NULL`.
  - The TypeScript contract no longer permits accidental guest `ADMIN` roles and now preserves inviter metadata.
- Failure signature:
  - `PRRT_kwDORWcwRc5zlqFl|PRRT_kwDORWcwRc5zlqGU|PRRT_kwDORWcwRc5zlqGu|PRRT_kwDORWcwRc5zlqHD|PRRT_kwDORWcwRc5zlqHQ`
- Next actions:
  - Commit, push, and resolve/respond to the five configured-bot review threads on PR #385.




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
