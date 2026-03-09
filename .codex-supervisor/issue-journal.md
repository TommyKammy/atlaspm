# Issue #272: P1-3: Build saved-view UI for save/apply/rename/delete

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/272
- Branch: codex/reopen-issue-272
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-272
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-272/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 3
- Last head SHA: 212b31b691eb6b55e540754d3e1230c9adfc8283
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5y7n84|PRRT_kwDORWcwRc5y7n9N|PRRT_kwDORWcwRc5y7n9U
- Repeated failure signature count: 1
- Updated at: 2026-03-09T06:23:40.355Z

## Latest Codex Summary
Draft PR is open at https://github.com/TommyKammy/atlaspm/pull/308 on `codex/reopen-issue-272`. The saved-view checkpoint remains `212b31b` (`Add saved view controls to project shell`), and the focused verification still passes for save/apply/rename/delete/default reload behavior.

The only remaining local dirt is non-checkpoint metadata: the updated issue journal and generated `apps/web-ui/tsconfig.tsbuildinfo`.

Summary: Pushed the saved-view checkpoint and opened draft PR #308 for review.
State hint: draft_pr
Blocked reason: none
Tests: `pnpm --filter @atlaspm/web-ui type-check`; `./scripts/run-e2e.sh tests/saved-views.spec.ts`; `E2E_REBUILD=1 ./scripts/run-e2e.sh tests/saved-views.spec.ts`
Failure signature: none
Next action: Monitor draft PR #308 for CI or review feedback and address any focused follow-up issues.

## Active Failure Context
- Category: review
- Summary: 3 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/308#discussion_r2903435265
- Details:
  - apps/web-ui/src/components/layout/ProjectSavedViewsControl.tsx:322 `data-testid` for apply uses `view.name`, which is user-controlled and changes on rename. This makes selectors brittle (e.g., names containing quotes/special chars) and breaks the general convention elsewhere in the repo of using stable identifiers in test ids. Use `view.id` (or a normalized/sanitized segment) for the test id, and rely on visible text (or a separate attribute) to assert the name in tests. ```suggestion data-testid={`saved-view-apply-${view.id}`} ```
  - e2e/playwright/tests/saved-views.spec.ts:96 After clicking "set default", the test proceeds and then calls `page.reload()` without explicitly waiting for the default-setting request to finish. A navigation/reload can cancel in-flight fetches, which can make this E2E flow flaky. Add an explicit wait for the mutation to settle (e.g., wait for the button to exit the pending state/text to revert, or wait for the saved-views response to reflect the new default) before reloading.
  - apps/web-ui/src/lib/types.ts:39 `ProjectViewMode`, `ProjectViewCustomFieldFilter`, and `ProjectViewState` are re-declared here even though identical types already exist in `@atlaspm/domain` (see `packages/domain/src/services/project-view-state.ts`). Duplicating these shapes in web-ui risks drift and subtle incompatibilities over time (e.g., when a new mode or filter field is added). Prefer importing/re-exporting the domain types (or referencing them directly) and only define web-ui–specific API response wrappers in this file. ```suggestion import type { ProjectViewMode, ProjectViewCustomFieldFilter, ProjectViewState } from '@atlaspm/domain'; export type { ProjectViewMode, ProjectViewCustomFieldFilter, ProjectViewState }; export type Project = { id: string; workspaceId: string; name: string }; ```

## Codex Working Notes
### Current Handoff
- Hypothesis: The saved-view issue is a missing `web-ui` surface, not a backend gap. A focused list-view e2e can drive the narrowest useful implementation, then the same shell control can bridge timeline/gantt state via lightweight local-storage + event sync.
- Primary failure or risk: Automated review flagged three valid follow-ups: unstable user-controlled `data-testid` values, duplicated project-view domain types in `web-ui`, and an e2e reload that could race the default-save request.
- Last focused command: `cd /home/tommy/Dev/atlaspm-worktrees/issue-272 && E2E_REBUILD=1 ./scripts/run-e2e.sh tests/saved-views.spec.ts`
- Files changed: `apps/web-ui/src/components/layout/ProjectSavedViewsControl.tsx`, `apps/web-ui/src/lib/types.ts`, `e2e/playwright/tests/saved-views.spec.ts`
- Next 1-3 actions:
  1. Commit and push the review-fix follow-up to PR #308.
  2. Resolve the three automated review threads after the branch update.
  3. If more feedback arrives, keep the next change constrained to saved-view shell behavior.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Reproduced first with `./scripts/run-e2e.sh tests/saved-views.spec.ts`; initial focused failure was `saved-view-trigger` missing in the project header.
- Needed `pnpm install` in this worktree before the Playwright runner was available.
- Current focused verification passing:
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/web-ui lint`
  - `./scripts/run-e2e.sh tests/saved-views.spec.ts`
  - `E2E_REBUILD=1 ./scripts/run-e2e.sh tests/saved-views.spec.ts`
- Branch/PR status:
  - committed checkpoint: `212b31b` (`Add saved view controls to project shell`)
  - pushed branch: `origin/codex/reopen-issue-272`
  - draft PR: `https://github.com/TommyKammy/atlaspm/pull/308`
- UI slice implemented:
  - Added a shared project saved-view popover in the header for save/apply/rename/delete/set-default.
  - List/board saved views serialize current filter state from URL params and clear active named selection on manual filter edits.
  - Timeline/gantt now resolve defaults/named views from `/projects/:id/saved-views`, and listen for shell apply events so named/default changes take effect without refresh.
  - Focused Playwright coverage now exercises save, apply, rename, delete, and default-on-reload for list view.
- Review follow-up applied:
  - saved-view apply buttons now use stable `view.id`-based test ids.
  - `apps/web-ui/src/lib/types.ts` now re-exports project-view types from `@atlaspm/domain` instead of duplicating them.
  - the Playwright default-save step now waits for the `PUT /saved-views/defaults/list` response before reloading.
- Local workspace note:
  - `apps/web-ui/tsconfig.tsbuildinfo` is still modified from local type-checking and was not included in the checkpoint commit.
