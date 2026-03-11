# Issue #368: P4: Define integration provider abstraction and storage contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/368
- Branch: codex/reopen-issue-368
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-368
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-368/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 2
- Last head SHA: 6728a704018a2f9be249cec13051a5a96f8964af
- Blocked reason: none
- Last failure signature: lint:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-11T02:01:13.565Z

## Latest Codex Summary
Implemented the integration provider groundwork in `core-api` and docs, with a focused repro-first path. The new contract test in [apps/core-api/test/integration-contracts.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-368/apps/core-api/test/integration-contracts.test.ts) initially failed on missing provider/storage contracts; the branch now has Prisma models and migration for provider config, credentials, sync state, and entity mappings in [schema.prisma](/home/tommy/Dev/atlaspm-worktrees/issue-368/apps/core-api/prisma/schema.prisma) and [migration.sql](/home/tommy/Dev/atlaspm-worktrees/issue-368/apps/core-api/prisma/migrations/20260311110000_add_integration_provider_contracts/migration.sql).

The explicit provider abstraction lives in [integration-provider.contract.ts](/home/tommy/Dev/atlaspm-worktrees/issue-368/apps/core-api/src/integrations/integration-provider.contract.ts) and [integration-provider.registry.ts](/home/tommy/Dev/atlaspm-worktrees/issue-368/apps/core-api/src/integrations/integration-provider.registry.ts). Slack now implements that abstraction in [slack.provider.ts](/home/tommy/Dev/atlaspm-worktrees/issue-368/apps/core-api/src/integrations/slack.provider.ts), and [slack.controller.ts](/home/tommy/Dev/atlaspm-worktrees/issue-368/apps/core-api/src/integrations/slack.controller.ts) delegates through the registry instead of carrying provider logic inline. The contract and operational expectations are documented in [docs/integrations-provider-contract.md](/home/tommy/Dev/atlaspm-worktrees/issue-368/docs/integrations-provider-contract.md) and linked from [docs/architecture.md](/home/tommy/Dev/atlaspm-worktrees/issue-368/docs/architecture.md). I also updated the issue journal and committed the checkpoint as `6728a70` (`Define integration provider contracts`).

Verified with `pnpm --filter @atlaspm/core-api prisma:generate`, `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`, `pnpm --filter @atlaspm/core-api type-check`, and `git diff --check`.

Summary: Added explicit integration provider abstraction, Prisma storage contracts, Slack provider implementation, docs, focused tests, and committed the result.
State hint: implementing
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api prisma:generate`; `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`; `pnpm --filter @atlaspm/core-api type-check`; `git diff --check`
Failure signature: none
Next action: Open or update a draft PR for this contract slice, or start the next dependent integration issue against the new provider/storage contracts

## Active Failure Context
- Category: checks
- Summary: PR #375 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/375
- Details:
  - lint (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22933011586/job/66558412518

## Codex Working Notes
### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.

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

### 2026-03-11 Codex CI Repair
- Hypothesis:
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
