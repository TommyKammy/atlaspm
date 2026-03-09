# Issue #314: P0: Fail closed for Slack webhook signature verification

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/314
- Branch: codex/reopen-issue-314
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-314
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-314/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 3
- Last head SHA: a6cbc4c12c4f297e5b8ba109c455fc50e769c59d
- Blocked reason: none
- Last failure signature: e2e:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-09T11:52:24.117Z

## Latest Codex Summary
The review comment was valid. I kept the existing import and added an explicit `Promise<INestApplication>` return type to `createSlackApp()` in [`slack-webhook-signature.test.ts`](/home/tommy/Dev/atlaspm-worktrees/issue-314/apps/core-api/test/slack-webhook-signature.test.ts#L31), which resolves the unused-import complaint without changing test behavior.

I reran the focused Slack webhook test, committed the follow-up as `a6cbc4c` (`Address Slack webhook test review`), pushed it to `codex/reopen-issue-314`, and resolved review thread `PRRT_kwDORWcwRc5y_vW4` on PR #320. The PR is now waiting on the rerun; `type-check`, `lint`, and `test` were queued when I checked.

Summary: Addressed the only unresolved review thread by typing `createSlackApp()`, pushed commit `a6cbc4c`, and resolved the bot review thread on PR #320.
State hint: waiting_ci
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api exec vitest run test/slack-webhook-signature.test.ts --reporter=dot`
Failure signature: none
Next action: Watch PR #320 CI rerun after `a6cbc4c` and repair any failing job if one appears.

## Active Failure Context
- Category: checks
- Summary: PR #320 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/320
- Details:
  - e2e (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22851770440/job/66281999373

## Codex Working Notes
### Current Handoff
- Hypothesis: The controller is correct; the failing e2e suite still posts unsigned Slack requests and needs to sign its test payloads against the compose-stack secret.
- Primary failure or risk: PR #320 `e2e` failed because `tests/slack.spec.ts` expected the old unsigned behavior. CI got `503` instead of `400/201` once `SLACK_SIGNING_SECRET` was enforced.
- Last focused command: `pnpm --filter @atlaspm/playwright e2e tests/slack.spec.ts`
- Files changed: `e2e/playwright/tests/slack.spec.ts`, `infra/docker/docker-compose.yml`
- Next 1-3 actions:
  1. Commit and push the e2e Slack-signing fix.
  2. Watch PR #320 for the rerun after the new commit.
  3. If another e2e job fails, inspect that specific log instead of relaxing Slack verification.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed local setup first in this worktree:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
- Focused reproduction:
  - Added `apps/core-api/test/slack-webhook-signature.test.ts` with a single missing-secret challenge test first.
  - Reproduced on the first real run: `expected 201 to be greater than or equal to 400`, confirming the route accepted a request with no signing secret.
- Current focused verification passing:
  - `docker compose -f infra/docker/docker-compose.yml up -d postgres core-api collab-server web-ui`
  - `curl -fsS http://localhost:3001/docs >/dev/null`
  - `curl -fsS http://localhost:3000/login >/dev/null`
  - `pnpm --filter @atlaspm/playwright e2e tests/slack.spec.ts`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/slack-webhook-signature.test.ts --reporter=dot`
  - `docker compose -f infra/docker/docker-compose.yml down`
- Implementation notes:
  - `SlackWebhookController` now throws `503 Service Unavailable` when `SLACK_SIGNING_SECRET` is missing instead of logging and continuing.
  - The focused webhook test covers missing secret, invalid signature, stale timestamp, valid signed challenge, and valid signed app mention processing.
  - `pnpm --filter @atlaspm/core-api type-check` initially failed with missing Prisma client types until `pnpm --filter @atlaspm/core-api prisma:generate` was rerun; after generation, the type-check passed cleanly.
  - Review follow-up: added an explicit `Promise<INestApplication>` return type to `createSlackApp()` so the existing `INestApplication` import is used and the bot thread is addressed without changing behavior.
  - CI repair notes:
    - Pulled the failing log with `gh run view 22851770440 --job 66281999373 --log`.
    - Exact CI assertion: `tests/slack.spec.ts:128 expected 400, received 503` after the suite sent unsigned requests to `/webhooks/slack/events`.
    - Added `SLACK_SIGNING_SECRET=atlaspm-e2e-slack-signing-secret-123` to the compose `core-api` service and updated `e2e/playwright/tests/slack.spec.ts` to sign the exact JSON body it posts.
