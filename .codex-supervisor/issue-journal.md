# Issue #272: P1-3: Build saved-view UI for save/apply/rename/delete

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/272
- Branch: codex/reopen-issue-272
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-272
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-272/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 2ea22e668b1e809d957ec5302843c0fcbd5aa643
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T05:55:18.239Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The saved-view issue is a missing `web-ui` surface, not a backend gap. A focused list-view e2e can drive the narrowest useful implementation, then the same shell control can bridge timeline/gantt state via lightweight local-storage + event sync.
- Primary failure or risk: The project shell had no saved-view trigger or client state/mutation layer, so users could not save/apply/rename/delete named views or set defaults from the UI without a refresh.
- Last focused command: `cd /home/tommy/Dev/atlaspm-worktrees/issue-272 && ./scripts/run-e2e.sh tests/saved-views.spec.ts`
- Files changed: `apps/web-ui/src/components/layout/HeaderBar.tsx`, `apps/web-ui/src/components/layout/ProjectSavedViewsControl.tsx`, `apps/web-ui/src/components/project-timeline-view.tsx`, `apps/web-ui/src/lib/project-saved-views.ts`, `apps/web-ui/src/lib/query-keys.ts`, `apps/web-ui/src/lib/types.ts`, `apps/web-ui/src/lib/i18n.tsx`, `e2e/playwright/tests/saved-views.spec.ts`
- Next 1-3 actions:
  1. Commit the saved-view UI + focused e2e checkpoint on `codex/reopen-issue-272`.
  2. Decide whether to expand coverage from list view into timeline/gantt specific flows in a follow-up slice.
  3. If review finds edge cases around precedence, keep changes scoped to the saved-view resolver and shell control.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduced first with `./scripts/run-e2e.sh tests/saved-views.spec.ts`; initial focused failure was `saved-view-trigger` missing in the project header.
- Needed `pnpm install` in this worktree before the Playwright runner was available.
- Current focused verification passing:
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `./scripts/run-e2e.sh tests/saved-views.spec.ts`
  - `E2E_REBUILD=1 ./scripts/run-e2e.sh tests/saved-views.spec.ts`
- UI slice implemented:
  - Added a shared project saved-view popover in the header for save/apply/rename/delete/set-default.
  - List/board saved views serialize current filter state from URL params and clear active named selection on manual filter edits.
  - Timeline/gantt now resolve defaults/named views from `/projects/:id/saved-views`, and listen for shell apply events so named/default changes take effect without refresh.
  - Focused Playwright coverage now exercises save, apply, rename, delete, and default-on-reload for list view.
