# Issue #314: P0: Fail closed for Slack webhook signature verification

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/314
- Branch: codex/reopen-issue-314
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-314
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-314/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 369a9ee3d378d9b5cda96fbd6e66ffe921e43a3a
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T11:29:15.346Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: `SlackWebhookController` currently fails open because it accepts unsigned Slack requests whenever `SLACK_SIGNING_SECRET` is unset.
- Primary failure or risk: `POST /webhooks/slack/events` returned `201` with the Slack challenge body even when `SLACK_SIGNING_SECRET` was missing, so verification could be bypassed entirely.
- Last focused command: `pnpm --filter @atlaspm/core-api exec vitest run test/slack-webhook-signature.test.ts --reporter=dot`
- Files changed: `apps/core-api/src/integrations/slack.controller.ts`, `apps/core-api/test/slack-webhook-signature.test.ts`
- Next 1-3 actions:
  1. Commit the Slack fail-closed fix and focused tests.
  2. Push the branch and open or update a draft PR if one is still missing.
  3. If CI surfaces webhook-specific regressions, inspect those logs before widening the Slack integration surface.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed local setup first in this worktree:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
- Focused reproduction:
  - Added `apps/core-api/test/slack-webhook-signature.test.ts` with a single missing-secret challenge test first.
  - Reproduced on the first real run: `expected 201 to be greater than or equal to 400`, confirming the route accepted a request with no signing secret.
- Current focused verification passing:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/slack-webhook-signature.test.ts --reporter=dot`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - `SlackWebhookController` now throws `503 Service Unavailable` when `SLACK_SIGNING_SECRET` is missing instead of logging and continuing.
  - The focused webhook test covers missing secret, invalid signature, stale timestamp, valid signed challenge, and valid signed app mention processing.
  - `pnpm --filter @atlaspm/core-api type-check` initially failed with missing Prisma client types until `pnpm --filter @atlaspm/core-api prisma:generate` was rerun; after generation, the type-check passed cleanly.
