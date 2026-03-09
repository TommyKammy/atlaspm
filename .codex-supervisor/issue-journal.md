# Issue #324: P1: Introduce global API throttling baseline with route-specific overrides

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/324
- Branch: codex/reopen-issue-324
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-324
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-324/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: e63e4b33cc2716471ffe3d36da61db44cc5ea095
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zCO_F|PRRT_kwDORWcwRc5zCO_v|PRRT_kwDORWcwRc5zCPAF
- Repeated failure signature count: 1
- Updated at: 2026-03-09T14:22:49.981Z

## Latest Codex Summary
Addressed the configured-bot review on PR #327 by tightening `apps/core-api/test/throttling.integration.test.ts` without changing runtime behavior.

The test now snapshots/restores the exact env vars it mutates and asserts the success boundary for both policies: 60 successful baseline requests before the 61st is throttled, and 10 successful Slack requests before the 11th is throttled.

Tests run:
`pnpm --filter @atlaspm/core-api exec vitest run test/throttling.integration.test.ts test/slack-webhook-signature.test.ts --reporter=dot`
`pnpm --filter @atlaspm/core-api type-check`

Summary: Tightened the throttling regression test to address review comments about env leakage and weak boundary assertions.
State hint: addressing_review
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api exec vitest run test/throttling.integration.test.ts test/slack-webhook-signature.test.ts --reporter=dot`; `pnpm --filter @atlaspm/core-api type-check`
Failure signature: none
Next action: Commit and push the review-fix test changes, then resolve the three configured-bot threads on PR #327.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The issue was caused by throttling config living only in `IntegrationsModule` without a global `ThrottlerGuard`, so neither baseline routes nor Slack overrides were enforced.
- Primary failure or risk: The remaining work is operational: push the review-fix commit and clear the three resolved review threads on PR #327.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
- Files changed: `apps/core-api/test/throttling.integration.test.ts`
- Next 1-3 actions:
  1. Commit and push the tightened throttling test.
  2. Resolve the three configured-bot review threads on PR #327.
  3. Re-check PR #327 merge state after GitHub finishes processing the update.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed local setup in this worktree:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/shared-types build`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
- Focused reproduction:
  - Added `apps/core-api/test/throttling.integration.test.ts`.
  - Reproduced with `POST /dev-auth/token` still returning `201` on the 71st request and `POST /webhooks/slack/events` still returning `201` on the 11th request.
- Failure signature:
  - `throttling-not-enforced-app-or-slack`
- Current focused verification passing:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/throttling.integration.test.ts test/slack-webhook-signature.test.ts --reporter=dot`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Added `ApiThrottlingModule` with `ThrottlerModule.forRoot([{ name: 'default', limit: 60, ttl: 60000 }])` and registered `ThrottlerGuard` as an `APP_GUARD`.
  - Removed the inert module-local `ThrottlerModule` registration from `IntegrationsModule`.
  - Kept Slack on a stricter override (`10/minute`) and added a higher-volume override for `GET /public/attachments/:id/:token` (`300/minute`).
  - Review follow-up snapshots and restores the mutated env keys in `test/throttling.integration.test.ts`.
  - Review follow-up now asserts 60 baseline successes before the 61st request gets `429`, and 10 Slack successes before the 11th gets `429`.
