# Issue #368: P4: Define integration provider abstraction and storage contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/368
- Branch: codex/reopen-issue-368
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-368
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-368/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 3
- Last head SHA: 540b420c5f96b7c6f06516aa9a5e1bf054d9f595
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zd2ud|PRRT_kwDORWcwRc5zd2us
- Repeated failure signature count: 1
- Updated at: 2026-03-11T02:07:43.715Z

## Latest Codex Summary
Reproduced the failing CI lint job locally from the Actions log, and it was exactly two `@typescript-eslint/no-unused-vars` errors in [slack.provider.ts](/home/tommy/Dev/atlaspm-worktrees/issue-368/apps/core-api/src/integrations/slack.provider.ts): the unused `authorize` and `sync` context parameters. I fixed that without changing behavior by keeping the interface-conformant parameters and marking them intentionally unused with `void context;`.

Verified with `gh run view 22933011586 --job 66558412518 --log`, `pnpm --filter @atlaspm/core-api lint`, `pnpm lint`, `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`, and `git diff --check`. I updated the issue journal, committed the repair as `540b420` (`Fix integration provider lint failure`), and pushed `codex/reopen-issue-368`. `gh pr checks 375` currently reports no checks yet on the updated branch, so the rerun is still pending registration.

Summary: Reproduced and fixed the PR #375 lint failure, verified locally, updated the journal, committed, and pushed the branch
State hint: waiting_ci
Blocked reason: none
Tests: `gh run view 22933011586 --job 66558412518 --log`; `pnpm --filter @atlaspm/core-api lint`; `pnpm lint`; `pnpm --filter @atlaspm/core-api exec vitest run test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`; `git diff --check`
Failure signature: none
Next action: Watch PR #375 for the rerun of lint and confirm the updated branch clears CI

## Active Failure Context
- Category: review
- Summary: 2 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/375#discussion_r2915439409
- Details:
  - apps/core-api/src/integrations/integration-provider.registry.ts:14 IntegrationProviderRegistry currently overwrites providers silently when two providers share the same `provider.key` (later `Map.set` wins). That makes misconfiguration hard to detect and can route requests to the wrong provider. Consider detecting duplicate keys during construction and throwing an error (or logging + throwing) when a duplicate is registered. ```suggestion for (const provider of providers) { if (this.providersByKey.has(provider.key)) { throw new Error( `Duplicate integration provider key detected: ${provider.key}`, ); } ```
  - apps/core-api/src/integrations/slack.provider.ts:169 Slack `message` event payloads typically represent mentions as `<@USERID>` (not `@USERID`). Checking `event.text?.includes(`@${SLACK_BOT_USER_ID}`)` can fail to detect actual mentions, so `message` events that mention the bot may be ignored. Consider checking for `<@${SLACK_BOT_USER_ID}>` (and optionally a fallback for display-name mentions) instead. ```suggestion case 'message': { const botUserId = process.env.SLACK_BOT_USER_ID; const mentionById = botUserId ? `<@${botUserId}>` : null; const mentionByName = '@AtlasPM'; const text = event.text || ''; if ((mentionById && text.includes(mentionById)) || text.includes(mentionByName)) { await this.handleMention(event); } break; } ```

## Codex Working Notes
### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.

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
