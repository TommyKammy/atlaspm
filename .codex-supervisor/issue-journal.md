# Issue #358: P3: Add regression coverage for goals, linkage, and rollups

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/358
- Branch: codex/reopen-issue-358
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-358
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-358/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: d9cb84d2a5c84fa208e67d63373cc349a81ba06d
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zc6Yb|PRRT_kwDORWcwRc5zc6Y0
- Repeated failure signature count: 2
- Updated at: 2026-03-10T23:54:25.816Z

## Latest Codex Summary
Added the missing regression layer for goals and closed the two product gaps the new tests exposed. The new integration case in [goals.integration.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-358/apps/core-api/test/goals.integration.test.ts) proves project viewers can read aligned goals while alignment mutations still stay forbidden, and the new Playwright coverage in [goals.spec.ts](/home/tommy/Dev/atlaspm-worktrees/issue-358/e2e/playwright/tests/goals.spec.ts) covers goal CRUD, project linkage, rollup updates, reload persistence, history, and viewer read-only behavior.

To make those tests pass, [goals.service.ts](/home/tommy/Dev/atlaspm-worktrees/issue-358/apps/core-api/src/goals/goals.service.ts) now allows project viewers to read `/projects/:id/goals`, [project-goals-card.tsx](/home/tommy/Dev/atlaspm-worktrees/issue-358/apps/web-ui/src/components/project-goals-card.tsx) is gated by `canEdit`, [page.tsx](/home/tommy/Dev/atlaspm-worktrees/issue-358/apps/web-ui/src/app/projects/[id]/page.tsx) passes that permission through, and [project-status-updates.tsx](/home/tommy/Dev/atlaspm-worktrees/issue-358/apps/web-ui/src/components/project-status-updates.tsx) now invalidates `projectGoals` so linked-goal rollups refresh immediately on the project page. I updated the issue journal and committed the checkpoint as `d9cb84d` (`test: add goals regression coverage`).

Summary: Added focused goal integration and Playwright regression coverage, fixed viewer access to aligned goals, hid alignment edits for read-only users, and refreshed project goal rollups after status updates.
State hint: draft_pr
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/domain build`; `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`; `pnpm --filter @atlaspm/core-api type-check`; `pnpm --filter @atlaspm/web-ui type-check`; `E2E_REBUILD=1 E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts`; `E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts`
Failure signature: none
Next action: Open or update the issue PR from `codex/reopen-issue-358` so CI runs the new goals integration and E2E coverage.

## Active Failure Context
- Category: waiting_ci
- Summary: Review threads are resolved and PR #372 has been updated; the remaining live signal is the `e2e` CI job still in progress after push.
- Reference: https://github.com/TommyKammy/atlaspm/pull/372
- Details:
  - Head advanced to `f60d202`.
  - Resolved review threads:
    - `PRRT_kwDORWcwRc5zc6Yb`
    - `PRRT_kwDORWcwRc5zc6Y0`
  - `gh pr view 372 --json statusCheckRollup` shows `e2e` as `IN_PROGRESS`; all other reported checks are `SUCCESS`.

## Codex Working Notes
### Current Handoff
- Hypothesis: The review follow-up is complete. The remaining risk is ordinary CI variance in the rerunning `e2e` job, not an unresolved local regression.
- Primary failure or risk: None locally. PR #372 is now waiting on CI after push `f60d202`, with `e2e` still running at the time of handoff.
- Last focused command: `gh pr view 372 --json mergeStateStatus,headRefName,headRefOid,statusCheckRollup,reviewDecision,url`
- Files changed: `apps/web-ui/src/app/projects/[id]/page.tsx`, `e2e/playwright/tests/goals.spec.ts`, and this journal.
- Next 1-3 actions:
  1. Watch PR #372 until the rerun `e2e` job completes.
  2. If `e2e` fails, inspect the uploaded Playwright artifacts for `e2e/playwright/tests/goals.spec.ts` first.
  3. Merge once the CI run is green and mergeable.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - Added `project viewers can read linked goals but cannot change goal alignment` to `apps/core-api/test/goals.integration.test.ts`.
  - Initial focused integration failure: `GET /projects/:id/goals` returned `403` for a project `VIEWER`; expected `200`.
  - Initial focused E2E failure: `project viewers can see aligned goals but not edit goal alignment or status updates` could not load seeded goals from stale Docker images until rebuild; after rebuild it confirmed the read-only project page behavior.
  - Second E2E failure after adding the owner flow: posting a project status update did not refresh the project goals card because `queryKeys.projectGoals(projectId)` was not invalidated.
  - Review follow-up:
    - `e2e/playwright/tests/goals.spec.ts` was asserting the nonexistent button label `"Add goal alignment"` instead of the real accessible label `"Add goal"`.
    - `ProjectGoalsCard` received `canEditProject === true` before membership queries resolved, so read-only users could briefly see alignment controls during initial load.
- Failure signature:
  - `none`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts`
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `E2E_REBUILD=1 E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts`
  - `E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts`
  - `pnpm --filter @atlaspm/web-ui type-check` (review follow-up)
  - `E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts` (review follow-up)
  - `git push origin codex/reopen-issue-358`
  - `gh api graphql -f query='mutation($thread:ID!){ resolveReviewThread(input:{threadId:$thread}) { thread { id isResolved } } }' -f thread='PRRT_kwDORWcwRc5zc6Yb'`
  - `gh api graphql -f query='mutation($thread:ID!){ resolveReviewThread(input:{threadId:$thread}) { thread { id isResolved } } }' -f thread='PRRT_kwDORWcwRc5zc6Y0'`
  - `gh pr view 372 --json mergeStateStatus,headRefName,headRefOid,statusCheckRollup,reviewDecision,url`
- Implementation notes:
  - `GoalsService.listProjectGoals` now accepts `ProjectRole.VIEWER` so read-only project members can see aligned goals.
  - `ProjectGoalsCard` now accepts `canEdit` and hides add/remove alignment controls for read-only users.
  - Project status updates now invalidate `queryKeys.projectGoals(projectId)` in addition to workspace goal queries, so project-page rollups refresh immediately.
  - Added `e2e/playwright/tests/goals.spec.ts` with:
    - owner CRUD/linkage/rollup/reload/history flow
    - viewer read-only alignment/status-update boundary flow
  - Review follow-up:
    - The viewer Playwright test now asserts the real accessible button name, `"Add goal"`.
    - The project page now computes `canEditProjectGoals` as `meQuery.isSuccess && projectMembersQuery.isSuccess && canEditProject` before passing edit access to `ProjectGoalsCard`.
    - Pushed as `f60d202` (`fix: address goals review feedback`) and resolved both Copilot review threads on PR #372.
