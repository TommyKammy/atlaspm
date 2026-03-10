# Issue #356: P3: Implement goal progress rollups and status history

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/356
- Branch: codex/reopen-issue-356
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-356
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-356/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: d145c2a8a4c5ceb811cd2a1d0e8b1bd2ff9d6bac
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zbuo0|PRRT_kwDORWcwRc5zbuo-|PRRT_kwDORWcwRc5zbupF
- Repeated failure signature count: 1
- Updated at: 2026-03-10T21:54:31.873Z

## Latest Codex Summary
Implemented goal rollups and queryable history in `core-api`, with the behavior proven first by a failing integration test and then fixed in the code. The core changes are in [goals.service.ts](/home/tommy/Dev/atlaspm-worktrees/issue-356/apps/core-api/src/goals/goals.service.ts), [goals.controller.ts](/home/tommy/Dev/atlaspm-worktrees/issue-356/apps/core-api/src/goals/goals.controller.ts), [goals.module.ts](/home/tommy/Dev/atlaspm-worktrees/issue-356/apps/core-api/src/goals/goals.module.ts), and [project-status-updates.controller.ts](/home/tommy/Dev/atlaspm-worktrees/issue-356/apps/core-api/src/projects/project-status-updates.controller.ts). Goals now recompute from each linked project’s latest status update, emit `goal.status_rollup_updated` audit/outbox events when rollups change, and expose history at `GET /goals/:id/history`.

The focused contract was added in [goals.integration.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-356/apps/core-api/test/goals.integration.test.ts). I also updated the issue journal and committed the checkpoint as `d145c2a` (`Add goal progress rollups and history API`).

Summary: Added goal progress/status rollups from linked project health plus a goal history API, and committed the checkpoint at `d145c2a`.
State hint: implementing
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/domain build`; `pnpm --filter @atlaspm/shared-types build`; `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`; `pnpm --filter @atlaspm/core-api type-check`; `pnpm --filter @atlaspm/core-api exec eslint src/goals/goals.controller.ts src/goals/goals.module.ts src/goals/goals.service.ts src/projects/project-status-updates.controller.ts`
Failure signature: none
Next action: Open or update the draft PR for issue #356 from commit `d145c2a`, then decide whether rollups should stay scoped to latest project health or expand to additional project inputs.

## Active Failure Context
- Category: review
- Summary: 3 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/360#discussion_r2914684817
- Details:
  - apps/core-api/src/goals/goals.service.ts:475 `refreshGoalRollup()` fetches *all* `projectStatusUpdate` rows for the linked projects and then derives the latest per project in memory. For projects with lots of status updates, this can become expensive and will run inside the calling transaction. Consider changing the query to return only the latest status update per project (e.g., via a `DISTINCT ON (projectId)`-style query, a `groupBy`/join approach, or a bounded per-project `findFirst`), so the amount of data read is proportional to the number of linked projects rather than total updates. ```suggestion // Fetch only the latest status update per project to avoid scanning all historical updates. const latestUpdateGroups = projectIds.length ? await tx.projectStatusUpdate.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds }, }, _max: { createdAt: true, id: true, }, }) : []; const latestUpdateIds = latestUpdateGroups .map((group) => group._max?.id) .filter((id): id is string => !!id); const updates = latestUpdateIds.length ? await tx.projectStatusUpdate.findMany({ where: { id: { in: latestUpdateIds }, }, }) : []; ```
  - apps/core-api/src/goals/goals.service.ts:379 In `refreshGoalRollupsForProject()`, `distinct: ['goalId']` is redundant because `GoalProjectLink` has a `@@unique([goalId, projectId])`, so for a given `projectId` each row already has a unique `goalId`. Removing `distinct` would simplify the query and avoid relying on DB-specific distinct behavior. ```suggestion ```
  - apps/core-api/src/goals/goals.service.ts:113 `getGoalHistory()` loads the full audit-event history for a goal with no limit/cursor. Since this is backed by `auditEvent.findMany()` and ordered ascending, a long-lived goal could return an unbounded payload and slow queries. Consider adding pagination parameters (e.g., `take` + `cursor` with a max) similar to other list endpoints, or at least applying a reasonable default/maximum limit.

## Codex Working Notes
### Current Handoff
- Hypothesis: The remaining PR risk is review-thread cleanup, not missing feature behavior. The implementation works, but `getGoalHistory()` and `refreshGoalRollup()` needed tightening for bounded reads.
- Primary failure or risk: The review issues are fixed locally and pushed in `fe548e3`, but PR #360 is `UNSTABLE` because CI restarted on the new commit and is still running.
- Last focused command: `gh pr view 360 --json isDraft,mergeStateStatus,reviewDecision,commits,statusCheckRollup`
- Files changed: `apps/core-api/src/goals/goals.controller.ts`, `apps/core-api/src/goals/goals.service.ts`, `apps/core-api/test/goals.integration.test.ts`
- Next 1-3 actions:
  1. Watch CI on PR #360 for `fe548e3`.
  2. If any new failures appear, repair them in this worktree rather than opening a new branch.
  3. If CI passes cleanly, move the issue state forward from review handling.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - Review follow-up, not a fresh feature gap: the open threads pointed to `apps/core-api/src/goals/goals.service.ts` for bounded history reads and rollup query cost.
- Failure signature:
  - `goal-rollup-review-followups`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api exec eslint src/goals/goals.controller.ts src/goals/goals.service.ts`
  - `git push origin codex/reopen-issue-356`
  - `gh api graphql -f query='mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}' -F threadId=PRRT_kwDORWcwRc5zbuo0`
  - `gh api graphql -f query='mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}' -F threadId=PRRT_kwDORWcwRc5zbuo-`
  - `gh api graphql -f query='mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}' -F threadId=PRRT_kwDORWcwRc5zbupF`
- Implementation notes:
  - Goal rollup uses each linked project's latest `ProjectStatusUpdate.health`: `ON_TRACK=100`, `AT_RISK=50`, `OFF_TRACK=0`, then averages across active links for `progressPercent`.
  - Goal status rollup takes the worst latest linked health: any `OFF_TRACK` wins, else any `AT_RISK`, else any `ON_TRACK`, else `NOT_STARTED`.
  - `POST /projects/:id/status-updates` now refreshes linked goal rollups inside the same transaction.
  - `GET /goals/:id/history` exposes status/progress snapshots from goal audit events, including dedicated `goal.status_rollup_updated` events.
  - Review fixes applied:
    - `GET /goals/:id/history` now accepts bounded `take` input and clamps at 100.
    - `refreshGoalRollupsForProject()` no longer uses redundant `distinct`.
    - `refreshGoalRollup()` now fetches one latest status row per linked project instead of scanning full project status history.
  - PR follow-up:
    - Review-thread fix commit: `fe548e3` (`Address goal rollup review feedback`)
    - All three configured-bot review threads were resolved after the push.
