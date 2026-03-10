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
- Category: review
- Summary: 2 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/372#discussion_r2915107881
- Details:
  - e2e/playwright/tests/goals.spec.ts:184 The viewer test is checking for a button named "Add goal alignment", but the UI label for `t('addGoalAlignment')` is currently "Add goal" (see i18n dictionary). As written, this assertion will always pass even if the alignment button is mistakenly visible, so it won't actually guard the regression. Update the locator to match the real accessible name (or switch to a stable data-testid/translation key driven selector) so the test fails if the control appears for viewers. ```suggestion await expect(viewerPage.getByRole('button', { name: 'Add goal' })).toHaveCount(0); ```
  - apps/web-ui/src/app/projects/[id]/page.tsx:384 `canEditProject` is computed as `true` when the current project role hasn't loaded yet (it defaults to `true` when `currentProjectRole` is null). Passing that value into `ProjectGoalsCard` means read-only users can briefly see alignment controls (and potentially trigger 403s) during initial load. Consider defaulting `canEditProject` to `false` until `meQuery` + `projectMembersQuery` resolve (or pass an explicit `canEdit={currentProjectRole !== 'VIEWER'}` only when the role is known) so viewer UI never renders edit affordances. ```suggestion <ProjectGoalsCard projectId={projectId} workspaceId={project.workspaceId} canEdit={meQuery.isSuccess && projectMembersQuery.isSuccess && canEditProject} /> ```

## Codex Working Notes
### Current Handoff
- Hypothesis: Both automated review comments are valid and should be fixed narrowly without reopening the broader goals behavior. One was a false-negative Playwright locator; the other was a read-only affordance flash on the project page while role data loads.
- Primary failure or risk: The only remaining work after the code fix is updating PR #372 so CI reruns and resolving the two review threads. Local host commands still warn on unsupported Node 24, but the touched web-ui and Playwright checks passed.
- Last focused command: `E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/goals.spec.ts`
- Files changed: `apps/web-ui/src/app/projects/[id]/page.tsx`, `e2e/playwright/tests/goals.spec.ts`, and this journal.
- Next 1-3 actions:
  1. Commit and push the review-follow-up patch to PR #372.
  2. Resolve the two Copilot review threads after push.
  3. Watch the refreshed PR checks, especially `e2e`.

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
  - `PRRT_kwDORWcwRc5zc6Yb|PRRT_kwDORWcwRc5zc6Y0`
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
