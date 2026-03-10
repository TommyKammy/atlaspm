# Issue #357: P3: Build goal management and project-alignment UI

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/357
- Branch: codex/reopen-issue-357
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-357
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-357/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 2
- Last head SHA: 1308c57685e348eca80e8a125671c6504310b045
- Blocked reason: none
- Last failure signature: e2e:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-10T22:29:05.490Z

## Latest Codex Summary
Implemented the `web-ui` goal surface and committed it as `1308c57` (`Add web goal management UI`).

The new slice adds workspace goal list/detail pages at [goals/page.tsx](/home/tommy/Dev/atlaspm-worktrees/issue-357/apps/web-ui/src/app/workspaces/[workspaceId]/goals/page.tsx) and [goals/[goalId]/page.tsx](/home/tommy/Dev/atlaspm-worktrees/issue-357/apps/web-ui/src/app/workspaces/[workspaceId]/goals/[goalId]/page.tsx), a public goal API client plus focused reproducing test at [goals.ts](/home/tommy/Dev/atlaspm-worktrees/issue-357/apps/web-ui/src/lib/api/goals.ts) and [goals.test.ts](/home/tommy/Dev/atlaspm-worktrees/issue-357/apps/web-ui/src/lib/api/goals.test.ts), a sidebar entry, and a project-context alignment card at [project-goals-card.tsx](/home/tommy/Dev/atlaspm-worktrees/issue-357/apps/web-ui/src/components/project-goals-card.tsx). I also wired project status updates to invalidate goal queries so linked goal rollups refresh without manual reload.

Focused verification passed for the new goal client and `web-ui` static checks. `pnpm --filter @atlaspm/web-ui build` still fails, but on a pre-existing Turbopack/module-resolution issue in existing `@atlaspm/domain` imports outside this goal patch.

Summary: Added minimal goal management and project-alignment UI in `web-ui`, with focused test coverage and a checkpoint commit at `1308c57`.
State hint: implementing
Blocked reason: none
Tests: `pnpm install`; `pnpm --filter @atlaspm/web-ui test -- src/lib/api/goals.test.ts`; `pnpm --filter @atlaspm/web-ui type-check`; `pnpm --filter @atlaspm/web-ui lint`; `pnpm --filter @atlaspm/web-ui build` (fails on pre-existing `@atlaspm/domain` resolution errors)
Failure signature: preexisting-web-ui-domain-build-resolution
Next action: Manually review the new goal list/detail and project alignment flows, then decide whether to fix the baseline `@atlaspm/domain` build-resolution issue in this branch or treat this UI checkpoint as ready for PR follow-up.

## Active Failure Context
- Category: checks
- Summary: PR #361 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/361
- Details:
  - e2e (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22926873488/job/66539471180

## Codex Working Notes
### Current Handoff
- Hypothesis: The red PR signal is a flaky timeline marquee e2e rather than a deterministic regression from the goal UI. I could not reproduce the failing Playwright case locally, but I used the repairing-CI turn to remove the open review risks and cut the project-page goal lookup from N+1 requests to a single endpoint.
- Primary failure or risk: CI `e2e` may still be unstable until rerun, but the exact failing test (`timeline marquee selection can shift multiple tasks together immediately`) passed locally on repeated targeted runs. The remaining local verification gap is `core-api` integration under Node 24, which still hits the workspace `@atlaspm/domain` resolution issue in Vitest/Vite.
- Last focused command: `E2E_KEEP_UP=1 pnpm --filter @atlaspm/playwright exec playwright test tests/timeline.spec.ts -g "timeline marquee selection can shift multiple tasks together immediately" --repeat-each=5`
- Files changed: `apps/core-api/src/goals/goals.controller.ts`, `apps/core-api/src/goals/goals.service.ts`, `apps/core-api/test/goals.integration.test.ts`, `apps/web-ui/src/components/project-goals-card.tsx`, `apps/web-ui/src/components/project-status-updates.tsx`, `apps/web-ui/src/lib/api/goals.ts`, `apps/web-ui/src/lib/api/goals.test.ts`, `apps/web-ui/src/lib/query-keys.ts`, `apps/web-ui/src/lib/types.ts`, and both goal pages.
- Next 1-3 actions:
  1. Commit and push the review-fix patch so PR #361 reruns CI.
  2. If `e2e` fails again on the same timeline marquee test, treat it as a flaky or deeper timeline regression and pull the uploaded Playwright artifact for screenshot/video comparison against local runs.
  3. Resolve or reply to the configured-bot review threads, especially the project-goals N+1 thread, once the new single-query endpoint is on the PR branch.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - CI failure from `gh run view 22926873488 --job 66539471180 --log`: only `tests/timeline.spec.ts:432` failed, expecting selected tasks to shift from `dayIso(0)/dayIso(4)` to `dayIso(2)/dayIso(6)` after marquee drag, but both tasks stayed at their original start dates.
  - Local reproduction via Docker-backed Playwright did not fail once:
    - single run passed
    - `--repeat-each=5` passed all five runs
- Failure signature:
  - `timeline-marquee-ci-nonrepro`
- Current focused verification:
  - `gh pr checks 361`
  - `gh run view 22926873488 --job 66539471180 --log`
  - `E2E_KEEP_UP=1 ./scripts/run-e2e.sh e2e/playwright/tests/timeline.spec.ts -g "timeline marquee selection can shift multiple tasks together immediately"`
  - `E2E_KEEP_UP=1 pnpm --filter @atlaspm/playwright exec playwright test tests/timeline.spec.ts -g "timeline marquee selection can shift multiple tasks together immediately" --repeat-each=5`
  - `pnpm --filter @atlaspm/web-ui test -- src/lib/api/goals.test.ts`
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/web-ui lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/core-api test -- test/goals.integration.test.ts` (fails locally on existing `@atlaspm/domain` package resolution under Node 24/Vite)
- Implementation notes:
  - Added `GET /projects/:id/goals` to the goal API and switched the project page to use that single linked-goals query instead of one `/goals/:id/projects` request per goal.
  - Aligned `web-ui` goal typings with the actual API contract:
    - goal history entries no longer assume `id` / `actorUserId`
    - archive/unlink return `{ ok: true }`
    - link mutation returns the raw goal-project-link shape without nested `project`
  - Goal page selects now use the same focus-ring pattern as other selects in the app.
  - `ProjectStatusUpdates` now invalidates both active and `includeArchived` workspace-goal queries after rollup-affecting project status updates.
