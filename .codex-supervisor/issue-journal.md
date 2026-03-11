# Issue #368: P4: Define integration provider abstraction and storage contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/368
- Branch: codex/reopen-issue-368
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-368
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-368/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 8cd4a31dd7a5a041a2f11da336051ea248d12f64
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-11T01:53:11.164Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.


    - effort weeks still used `2400` instead of API capacity `420`
    - reduced-capacity task weeks were reported as `available`
  - That exposed a contract gap: `overloadAlerts` carried `capacity`, but non-overloaded reduced-capacity weeks had no capacity data at all.
- Implementation:
  - `apps/core-api/src/workload/workload.service.ts` now annotates every `weeklyBreakdown` entry with `capacityMinutes` and `capacityTasks` before computing overload alerts.
  - `apps/web-ui/src/lib/api/workload.ts` accepts the new weekly capacity fields.
  - `apps/web-ui/src/app/workspaces/[workspaceId]/workload/workload-helpers.ts` centralizes week/person status derivation and filtering.
  - `apps/web-ui/src/app/workspaces/[workspaceId]/workload/page.tsx` now:
    - uses actual weekly capacity instead of fixed thresholds
    - shows reduced-capacity indicators
    - adds client-side filters for `over-capacity`, `reduced-capacity`, and `available`
    - narrows visible week rows inside each card when a capacity filter is active
- Verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/web-ui test -- src/app/workspaces/[workspaceId]/workload/workload-helpers.test.ts` (failed first, then passed)
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`
- Reproduction:
  - Added `apps/core-api/test/capacity.integration.test.ts` to prove the missing contract first.
  - Initial feature failure: `POST /workspaces/:workspaceId/capacity-schedules` returned `404` because no capacity/time-off API existed.
  - Secondary setup failures while reproducing:
    - `prisma: not found` before `pnpm install`
    - Vite failed to resolve `@atlaspm/domain` before `pnpm --filter @atlaspm/domain build`
  - Behavioral follow-up during implementation:
    - Workload overload stayed empty because task estimates are updated through `PATCH /tasks/:id/estimate`, not task creation.
  - CI repair follow-up:
    - `gh pr checks 373` showed only `e2e` failing.
    - `gh run view 22930597973 --job 66551161894 --log` showed the job failed in `Build core-api image (cached)`, not in Playwright.
    - The actionable error was `buildx failed with ... invalid character '<' looking for beginning of value`, emitted while Docker’s action was generating/uploading build summaries/records.
  - Review follow-up:
    - Replaced the race-prone pre-insert duplicate read with DB-level uniqueness and `P2002` -> `409 Conflict` handling.
    - Added a follow-up migration for `capacity_schedules` partial unique indexes plus a `CHECK` tying `subject_type` and `subject_user_id`.
    - Batched workload weekly capacity resolution so one user/workload request fetches schedules once and overlapping time-off once.
    - Normalized workload week boundaries to UTC and restricted `timeZone` input to `UTC` until timezone-aware schedule math exists.
- Failure signature:
  - `workload-ui-ignored-api-capacity`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts` (failed: missing route)
  - `pnpm --filter @atlaspm/core-api prisma:generate && pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts` (passed)
  - `pnpm --filter @atlaspm/core-api type-check`
  - `gh pr checks 373`
  - `gh run view 22930597973 --job 66551161894 --log`
  - `gh run view 22930597973 --job 66551161894 --log | rg -n "invalid character|##\\[error\\]|buildx failed|Build core-api"`
  - `git diff --check`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/capacity.integration.test.ts`
- Implementation notes:
  - Added Prisma models `CapacitySchedule` and `TimeOffEvent` plus migration `20260311093000_add_capacity_schedules_and_time_off`.
  - Added `CapacityModule` with CRUD endpoints:
    - `POST/GET /workspaces/:workspaceId/capacity-schedules`
    - `PATCH /capacity-schedules/:id`
    - `POST/GET /workspaces/:workspaceId/time-off`
    - `PATCH/DELETE /time-off/:id`
  - Authorization model:
    - workspace members can read schedules/time-off
    - workspace admins can create, update, and delete them
  - Inheritance model:
    - workload uses the latest user-specific schedule if one exists
    - otherwise it falls back to the latest workspace-default schedule
    - otherwise it falls back to the legacy 40h default
  - Workload overload capacity now subtracts overlapping time-off minutes from schedule-derived weekly capacity.
  - CI mitigation:
    - Added `DOCKER_BUILD_SUMMARY: false` and `DOCKER_BUILD_RECORD_UPLOAD: false` to the cached Docker build steps in `.github/workflows/ci.yml` so the `e2e` job no longer depends on Docker action summary/build-record post-processing.
  - Review fixes:
    - Added migration `20260311094500_capacity_schedule_constraints` to enforce subject nullability and one-schedule-per-subject at the DB layer.
    - `CapacityService.createCapacitySchedule` now relies on the DB constraint and maps unique violations to `409 Conflict`.
    - `CapacityService.resolveWeeklyCapacityMinutesBatch` fetches schedules/time-off once per user/range and computes per-week capacities in memory.
    - `WorkloadService` now uses UTC-normalized week boundaries (`setUTCDate`/`setUTCHours`) and consumes batched capacity results.
    - `CapacityService` currently accepts only `timeZone === 'UTC'`, making the stored value honest until timezone-aware day-of-week calculations are implemented.
    - `apps/core-api/test/capacity.integration.test.ts` now covers duplicate schedule rejection and non-UTC schedule rejection.

### 2026-03-11 Codex Update (issue #368)
- Hypothesis:
  - The branch had only Slack-specific integration code and no explicit provider contract or persistence model for provider config, credentials, sync state, and entity mappings.
- Focused reproduction:
  - Added `apps/core-api/test/integration-contracts.test.ts`.
  - First focused run: `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts`
  - Initial setup failure: `Command "vitest" not found` before `pnpm install`.
  - Repro after install: the test failed because `schema.prisma` lacked `IntegrationProviderConfig`, `IntegrationCredential`, `IntegrationSyncState`, and `IntegrationEntityMapping`, and `apps/core-api/src/integrations/integration-provider.contract.ts` did not exist.
- Implementation:
  - Added Prisma enums/models for integration provider configs, credentials, sync state, and entity mappings in `apps/core-api/prisma/schema.prisma`.
  - Added migration `apps/core-api/prisma/migrations/20260311110000_add_integration_provider_contracts/migration.sql`.
  - Added `IntegrationProvider` contract and `IntegrationProviderRegistry`.
  - Added `SlackIntegrationProvider` implementing the shared contract.
  - Refactored `SlackWebhookController` to route webhook handling through the provider registry.
  - Updated Slack webhook tests to cover the refactor.
  - Documented the contract in `docs/integrations-provider-contract.md` and linked it from `docs/architecture.md`.
- Verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts` (failed: missing models/contract)
  - `pnpm --filter @atlaspm/core-api prisma:generate` (failed first on duplicate Prisma-generated unique names for integration mapping constraints)
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts test/slack-webhook-signature.test.ts` (failed first because Nest injected `undefined` for the registry until the controller used explicit `@Inject(IntegrationProviderRegistry)`)
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
- Current outcome:
  - The provider abstraction is explicit in code and docs.
  - Storage contracts are implemented in Prisma + SQL migration.
  - Slack now plugs into the abstraction as the first provider without embedding provider-specific logic directly in core controller flow.
- Failure signature:
  - `missing-integration-provider-contracts`
- Next actions:
  - Consider adding CRUD/service APIs for managing integration provider configs and credentials if a follow-on issue expects runtime management rather than contract-only groundwork.
