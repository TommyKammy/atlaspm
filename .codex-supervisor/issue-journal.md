# Issue #369: P4: Implement provider auth, sync-state, and job orchestration infrastructure

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/369
- Branch: codex/reopen-issue-369
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-369
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-369/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 53a46be9752e1691a4a65dfb6955a011affb0bac
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-11T02:22:14.620Z

## Latest Codex Summary
- Added `IntegrationRuntimeService` to handle provider auth status updates and persisted sync-state orchestration.
- Added focused runtime tests and re-verified existing provider contract, registry, and Slack webhook coverage.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.

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
