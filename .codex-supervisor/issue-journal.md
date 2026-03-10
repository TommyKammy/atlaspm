# Issue #355: P3: Add goal domain models and project linkage contracts

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/355
- Branch: codex/reopen-issue-355
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-355
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-355/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 712f511c8bb3411fbbcbf28ed9001e4e47880c22
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zbbJZ|PRRT_kwDORWcwRc5zbbJm|PRRT_kwDORWcwRc5zbbJx|PRRT_kwDORWcwRc5zbbKC|PRRT_kwDORWcwRc5zbbKL
- Repeated failure signature count: 1
- Updated at: 2026-03-10T21:28:57.521Z

## Latest Codex Summary
Addressed the five automated PR review threads on the goal slice.

Changes:
- Switched goal owner DTO validation from `@IsUUID()` to `@IsString()` so auth subject-based user IDs are accepted on create and update.
- Wrapped `GoalsService.addProjectLink()` in a `P2002` conflict translation so concurrent duplicate link creation returns `409` instead of bubbling as `500`.
- Scoped the goal integration test’s outbox assertions to the current run (`createdAt >= testStartedAt`) and the specific `goalId`.
- Scoped `GoalProjectLink` audit assertions to the concrete link IDs created by the test.

Tests run:
`pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`
`pnpm --filter @atlaspm/core-api type-check`
`pnpm --filter @atlaspm/core-api exec eslint src/goals/goals.controller.ts src/goals/goals.service.ts`

Summary: Fixed the unresolved automated review findings for PR #359 and reverified the focused goal slice locally.
State hint: addressing_review
Blocked reason: none
Tests: pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts; pnpm --filter @atlaspm/core-api type-check; pnpm --filter @atlaspm/core-api exec eslint src/goals/goals.controller.ts src/goals/goals.service.ts
Failure signature: none
Next action: Commit the review fixes, push `codex/reopen-issue-355`, and resolve the five PR review threads.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Issue #355 was an unimplemented `core-api` slice. The narrowest missing contract was `POST /goals`, which returned `404` before implementation.
- Primary failure or risk: The prior implementation was functionally okay, but five automated review comments identified DTO validation mismatches, a concurrency error mapping gap, and two test false-positive risks. Those fixes are now applied and passing locally.
- Last focused command: `pnpm --filter @atlaspm/core-api exec eslint src/goals/goals.controller.ts src/goals/goals.service.ts`
- Files changed: `apps/core-api/src/goals/goals.controller.ts`, `apps/core-api/src/goals/goals.service.ts`, `apps/core-api/test/goals.integration.test.ts`
- Next 1-3 actions:
  1. Commit the review-fix patch on `codex/reopen-issue-355`.
  2. Push the branch and resolve the five PR review threads on #359.
  3. Re-watch CI only if the PR picks up new failures after the push.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts` initially failed at `apps/core-api/test/goals.integration.test.ts:86` with `expected 201 "Created", got 404 "Not Found"` for `POST /goals`.
- Environment prep needed in this worktree before the real reproduction:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/shared-types build`
- Failure signature:
  - `goal-review-thread-fixes`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api exec eslint src/goals/goals.controller.ts src/goals/goals.service.ts`
- Implementation notes:
  - `ownerUserId` validation now matches the actual `User.id` semantics (`sub` strings, not UUIDs).
  - `addProjectLink()` now translates concurrent unique-constraint races to `ConflictException`.
  - Goal outbox assertions are bounded to this test run and goal payloads.
  - `GoalProjectLink` audit assertions are bounded to the created link IDs.
