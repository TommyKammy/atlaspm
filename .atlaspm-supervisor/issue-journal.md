# Issue #314: P0: Fail closed for Slack webhook signature verification

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/314
- Branch: codex/issue-314
- Workspace: /Users/tomoakikawada/Dev/atlaspm-worktrees/issue-314
- Journal: /Users/tomoakikawada/Dev/atlaspm-worktrees/issue-314/.atlaspm-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 369a9ee3d378d9b5cda96fbd6e66ffe921e43a3a
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T11:57:56.854Z

## Latest Codex Summary
- Added focused Slack webhook regression coverage for missing secret, invalid signature, stale timestamp, and valid signed challenge/app mention flows.
- Updated `SlackWebhookController` to reject requests with `503 Service Unavailable` when `SLACK_SIGNING_SECRET` is unset instead of skipping verification.
- Focused verification passed via `mise x node@20 -- pnpm --dir apps/core-api exec vitest run test/slack-webhook-signature.test.ts`.
- `mise x node@20 -- pnpm --filter @atlaspm/core-api type-check` still fails on broad pre-existing Prisma/client typing issues unrelated to this change.

## Active Failure Context
- None recorded.

## Codex Working Notes
- Update this section before ending each Codex turn.
- Record the active hypothesis, the exact failing test/check, what changed, and the next 1-3 actions.
- Keep the notes concise so future resume turns can pick up quickly.
- Active hypothesis: Slack webhook requests were failing open because `SlackWebhookController` skipped signature verification when `SLACK_SIGNING_SECRET` was unset; throwing an explicit 503 before any payload handling should satisfy fail-closed behavior while preserving signed flows.
- Exact failing test/check: `mise x node@20 -- pnpm --dir apps/core-api exec vitest run test/slack-webhook-signature.test.ts` initially failed with `expected 201 to be 503` for a `/webhooks/slack/events` `url_verification` request when `SLACK_SIGNING_SECRET` was missing.
- What changed: updated `apps/core-api/src/integrations/slack.controller.ts` to trim-check `SLACK_SIGNING_SECRET`, log the misconfiguration, and throw `ServiceUnavailableException` before signature verification; added `apps/core-api/test/slack-webhook-signature.test.ts` with focused coverage for missing secret, invalid signature, stale timestamp, valid challenge, and valid signed app mention processing.
- Commands run:
- 1. `mise x node@20 -- pnpm install`
- 2. `mise x node@20 -- pnpm --dir apps/core-api exec vitest run test/slack-webhook-signature.test.ts`
- 3. `mise x node@20 -- pnpm --filter @atlaspm/core-api type-check` (fails on pre-existing Prisma/client type errors across `core-api`)
- Next actions:
- 1. Commit this Slack webhook checkpoint on `codex/issue-314`.
- 2. Open a draft PR for the branch if GitHub auth is available.
- 3. If broader verification is needed later, resolve or work around the existing `core-api` Prisma/type baseline before rerunning package-wide checks.
