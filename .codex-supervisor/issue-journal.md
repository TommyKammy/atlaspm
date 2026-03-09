# Issue #314: P0: Fail closed for Slack webhook signature verification

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/314
- Branch: codex/reopen-issue-314
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-314
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-314/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: f74c038be5492c26a7a55b2c5e9e69c62bef1737
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5y_vW4
- Repeated failure signature count: 1
- Updated at: 2026-03-09T11:40:54.508Z

## Latest Codex Summary
Fail-closed Slack webhook verification is in place. [`slack.controller.ts`](/home/tommy/Dev/atlaspm-worktrees/issue-314/apps/core-api/src/integrations/slack.controller.ts#L99) now rejects requests with `503` when `SLACK_SIGNING_SECRET` is missing, instead of logging and continuing. I also added focused coverage in [`slack-webhook-signature.test.ts`](/home/tommy/Dev/atlaspm-worktrees/issue-314/apps/core-api/test/slack-webhook-signature.test.ts#L57) for missing secret, invalid signature, stale timestamp, valid signed challenge, and valid signed app mention flow.

Committed as `f74c038` (`Fail closed for Slack webhook signatures`), pushed to `codex/reopen-issue-314`, and opened draft PR [#320](https://github.com/TommyKammy/atlaspm/pull/320).

Summary: Slack webhooks now fail closed when verification cannot run, with focused tests covering missing-secret, invalid/stale signatures, and valid signed flows.
State hint: draft_pr
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api exec vitest run test/slack-webhook-signature.test.ts --reporter=dot`; `pnpm --filter @atlaspm/core-api prisma:generate`; `pnpm --filter @atlaspm/core-api type-check`
Failure signature: none
Next action: Watch PR #320 CI and fix any webhook-specific regressions if they appear.

## Active Failure Context
- Category: review
- Summary: 1 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/320#discussion_r2904884898
- Details:
  - apps/core-api/test/slack-webhook-signature.test.ts:3 `INestApplication` is imported but never used. Either remove the unused import, or (if you want the type here) add an explicit return type to `createSlackApp` (e.g., `Promise<INestApplication>`) so the import is justified.

## Codex Working Notes
### Current Handoff
- Hypothesis: The only remaining blocker is the automated review thread on `slack-webhook-signature.test.ts`; the implementation itself is already green.
- Primary failure or risk: PR thread `PRRT_kwDORWcwRc5y_vW4` flagged `INestApplication` as an unused import because `createSlackApp` had no explicit return type.
- Last focused command: `pnpm --filter @atlaspm/core-api exec vitest run test/slack-webhook-signature.test.ts --reporter=dot`
- Files changed: `apps/core-api/test/slack-webhook-signature.test.ts`
- Next 1-3 actions:
  1. Commit and push the review-fix follow-up.
  2. Resolve the remaining review thread on PR #320.
  3. Recheck PR status after the push.

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
  - Existing PR checks: `type-check`, `lint`, `test`, `build`
- Implementation notes:
  - `SlackWebhookController` now throws `503 Service Unavailable` when `SLACK_SIGNING_SECRET` is missing instead of logging and continuing.
  - The focused webhook test covers missing secret, invalid signature, stale timestamp, valid signed challenge, and valid signed app mention processing.
  - `pnpm --filter @atlaspm/core-api type-check` initially failed with missing Prisma client types until `pnpm --filter @atlaspm/core-api prisma:generate` was rerun; after generation, the type-check passed cleanly.
  - Review follow-up: added an explicit `Promise<INestApplication>` return type to `createSlackApp()` so the existing `INestApplication` import is used and the bot thread is addressed without changing behavior.
