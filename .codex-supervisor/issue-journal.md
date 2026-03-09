# Issue #324: P1: Introduce global API throttling baseline with route-specific overrides

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/324
- Branch: codex/reopen-issue-324
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-324
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-324/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: ed634b8b78e07a6d07ba3d101441fb2936bc847b
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T14:09:44.498Z

## Latest Codex Summary
- Reproduced missing app-level throttling with a focused `AppModule` integration test using a stubbed `PrismaService`.
- Added a shared app-level throttling module, kept Slack stricter than the baseline, and gave public attachment downloads a higher-volume override.
- Focused throttling and Slack signature tests now pass locally, along with `core-api` type-check.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The issue was caused by throttling config living only in `IntegrationsModule` without a global `ThrottlerGuard`, so neither baseline routes nor Slack overrides were enforced.
- Primary failure or risk: The focused fix is in place locally; remaining work is commit hygiene and any broader verification the supervisor wants beyond targeted tests.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
- Files changed: `apps/core-api/src/app.module.ts`, `apps/core-api/src/common/throttling.ts`, `apps/core-api/src/integrations/integrations.module.ts`, `apps/core-api/src/integrations/slack.controller.ts`, `apps/core-api/src/tasks/public-attachments.controller.ts`, `apps/core-api/test/throttling.integration.test.ts`
- Next 1-3 actions:
  1. Commit the throttling baseline changes and focused regression test.
  2. If needed, run a slightly broader `core-api` test slice around public routes before opening/updating a PR.
  3. Open or update the PR for issue #324 with the reproduction and focused verification notes.

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
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/shared-types build`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/throttling.integration.test.ts test/slack-webhook-signature.test.ts --reporter=dot`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Added `ApiThrottlingModule` with `ThrottlerModule.forRoot([{ name: 'default', limit: 60, ttl: 60000 }])` and registered `ThrottlerGuard` as an `APP_GUARD`.
  - Removed the inert module-local `ThrottlerModule` registration from `IntegrationsModule`.
  - Kept Slack on a stricter override (`10/minute`) and added a higher-volume override for `GET /public/attachments/:id/:token` (`300/minute`).
