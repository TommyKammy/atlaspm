# Issue #357: P3: Build goal management and project-alignment UI

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/357
- Branch: codex/reopen-issue-357
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-357
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-357/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: f0d10ece2e1d352cb1bc034e58786e3ac0edb5bb
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T22:10:46.729Z

## Latest Codex Summary
- Added initial `web-ui` goal management surface on top of the public goal API: workspace goal list/detail pages, goal API client/hooks, sidebar entry, and a project-page alignment card with live rollup status/progress.
- Added a focused reproducing test for the missing goal API client (`apps/web-ui/src/lib/api/goals.test.ts`), then implemented the client so the test now passes.
- Focused verification is green for `web-ui` test/lint/type-check. `pnpm --filter @atlaspm/web-ui build` still fails on a pre-existing workspace resolution problem where existing files cannot resolve `@atlaspm/domain`.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Issue #357 was mostly unimplemented in `web-ui`; the smallest proof was the absence of a goal API client and routes. The new list/detail/alignment UI is now present and wired only through the public goal endpoints.
- Primary failure or risk: Remaining risk is baseline app build health, not the new goal UI itself. `next build` fails in existing files because Turbopack cannot resolve `@atlaspm/domain` imports from multiple pre-existing modules.
- Last focused command: `pnpm --filter @atlaspm/web-ui build`
- Files changed: `apps/web-ui/src/app/workspaces/[workspaceId]/goals/page.tsx`, `apps/web-ui/src/app/workspaces/[workspaceId]/goals/[goalId]/page.tsx`, `apps/web-ui/src/components/project-goals-card.tsx`, `apps/web-ui/src/components/goal-utils.ts`, `apps/web-ui/src/lib/api/goals.ts`, `apps/web-ui/src/lib/api/goals.test.ts`, plus shared `Sidebar`, `project-status-updates`, `query-keys`, `types`, and `i18n` wiring.
- Next 1-3 actions:
  1. Review the new goal UI in-browser and decide whether to keep this as the first checkpoint or extend coverage (for example archived-goal toggles or richer history/alignment UX).
  2. If a full repo build gate is required for this issue, fix the existing `@atlaspm/domain` module-resolution problem in `apps/web-ui` before relying on `next build`.
  3. Commit the current `web-ui` goal management checkpoint once the journal update is recorded.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduction:
  - `apps/web-ui` had no goal routes, no goal API client, no sidebar entry, and no project-to-goal alignment UI.
  - Added `apps/web-ui/src/lib/api/goals.test.ts` first; it would not run until `pnpm install` because this worktree had no `node_modules`.
- Failure signature:
  - `missing-web-ui-goals-surface`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/web-ui test -- src/lib/api/goals.test.ts`
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/web-ui lint`
  - `pnpm --filter @atlaspm/web-ui build`
- Implementation notes:
  - New `web-ui` goal client exposes list/detail/history/project-link CRUD through public endpoints only.
  - Added workspace goal list and goal detail routes under `/workspaces/[workspaceId]/goals`.
  - Added project-page goal alignment card that resolves linked goals via workspace goal list + per-goal project-link reads and allows link/unlink mutations.
  - `ProjectStatusUpdates` now invalidates goal queries after posting a project status update so linked goal rollups refresh without a manual page reload.
  - Build blocker is unrelated to this patch: existing files such as `audit-activity-list.tsx`, `project-timeline-view.tsx`, `task-detail-drawer.tsx`, `use-timeline-data.ts`, and `project-saved-views.ts` fail Turbopack resolution for `@atlaspm/domain`.
