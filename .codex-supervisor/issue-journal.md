# Issue #324: P1: Introduce global API throttling baseline with route-specific overrides

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/324
- Branch: codex/reopen-issue-324
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-324
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-324/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 3
- Last head SHA: c1608d9d7ffa6fc80f5a8520d60768f2e7e7e427
- Blocked reason: none
- Last failure signature: e2e:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-09T14:39:02.826Z

## Latest Codex Summary
Investigated the failing PR #327 `e2e` job and confirmed it was caused by the new global baseline being too low for normal authenticated UI traffic.

The GitHub Actions log showed repeated `API 429` failures across Playwright timeline/workload specs. I raised the default baseline from `60/minute` to `300/minute`, raised the safe public attachment override to `1000/minute`, and updated the throttling regression test to assert 300 allowed baseline requests before the 301st is throttled.

Summary: Raised the general throttling baseline to avoid breaking legitimate UI/E2E traffic while preserving stricter and higher-volume overrides.
State hint: repairing_ci
Blocked reason: none
Tests: `gh run view 22858092874 --job 66304197200 --log`; `pnpm --filter @atlaspm/core-api exec vitest run test/throttling.integration.test.ts test/slack-webhook-signature.test.ts --reporter=dot`; `pnpm --filter @atlaspm/core-api type-check`; `E2E_REBUILD=1 pnpm e2e tests/timeline-root-cause.spec.ts`
Failure signature: e2e:api-429-default-throttle-too-low
Next action: Commit and push the higher baseline, then re-check PR #327 `e2e`.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The issue was caused by throttling config living only in `IntegrationsModule` without a global `ThrottlerGuard`, so neither baseline routes nor Slack overrides were enforced.
- Primary failure or risk: The runtime fix is ready locally; remaining risk is only CI confirmation after pushing the higher baseline. The targeted local Playwright run showed one unrelated flaky retry in `timeline-root-cause.spec.ts`, but no throttle failures.
- Last focused command: `E2E_REBUILD=1 pnpm e2e tests/timeline-root-cause.spec.ts`
- Files changed: `apps/core-api/src/common/throttling.ts`, `apps/core-api/test/throttling.integration.test.ts`
- Next 1-3 actions:
  1. Commit and push the higher default throttle baseline.
  2. Re-check PR #327 CI, especially `e2e`.
  3. If `e2e` still fails, inspect whether another handler needs an override instead of further raising the global baseline.

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
  - `gh run view 22858092874 --job 66304197200 --log`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/throttling.integration.test.ts test/slack-webhook-signature.test.ts --reporter=dot`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `E2E_REBUILD=1 pnpm e2e tests/timeline-root-cause.spec.ts`
- Implementation notes:
  - Added `ApiThrottlingModule` with `ThrottlerModule.forRoot([{ name: 'default', limit: 300, ttl: 60000 }])` and registered `ThrottlerGuard` as an `APP_GUARD`.
  - Removed the inert module-local `ThrottlerModule` registration from `IntegrationsModule`.
  - Kept Slack on a stricter override (`10/minute`) and raised the safe public attachment override for `GET /public/attachments/:id/:token` to `1000/minute`.
  - Review follow-up snapshots and restores the mutated env keys in `test/throttling.integration.test.ts`.
  - Review follow-up now asserts 300 baseline successes before the 301st request gets `429`, and 10 Slack successes before the 11th gets `429`.
  - CI diagnosis: the failing `e2e` job was returning `API 429` from normal authenticated requests during Playwright setup, especially on heavily reused routes like `/projects` and `/workspaces`.
