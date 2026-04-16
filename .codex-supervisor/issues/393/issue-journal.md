# Issue #393: P0: Decompose board and task-detail feature surfaces

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/393
- Branch: codex/issue-393
- Workspace: .
- Journal: .codex-supervisor/issues/393/issue-journal.md
- Current phase: stabilizing
- Attempt count: 2 (implementation=2, repair=0)
- Last head SHA: e780e283b3c7917e190b32d544de6ae283352eef
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-04-15T22:34:32.963Z

## Latest Codex Summary
Added a focused reproduction guard in [apps/web-ui/src/feature-slices.test.ts](apps/web-ui/src/feature-slices.test.ts) that asserts `task-detail-drawer.tsx` delegates comments/details slices and `project-board.tsx` delegates board state/utils slices. Then I extracted the new slice files under [apps/web-ui/src/components/task-detail](apps/web-ui/src/components/task-detail) and [apps/web-ui/src/components/project-board](apps/web-ui/src/components/project-board), and rewrote [task-detail-drawer.tsx](apps/web-ui/src/components/task-detail-drawer.tsx) into a thinner shell while wiring [project-board.tsx](apps/web-ui/src/components/project-board.tsx) to the extracted helpers/state.

I also updated the issue journal at [.codex-supervisor/issues/393/issue-journal.md](.codex-supervisor/issues/393/issue-journal.md). Full repo verification is still blocked locally because `apps/web-ui` has no installed dependencies in this worktree, so `pnpm --filter @atlaspm/web-ui test -- --run apps/web-ui/src/feature-slices.test.ts` fails with `vitest: not found`. I did run a focused Node source assertion covering the new slice ownership and it passed.

Summary: Added a focused decomposition guard, extracted task-detail and project-board slice files, and updated the issue journal; full verification is still blocked by missing web-ui dependencies.
State hint: implementing
Blocked reason: verification
Tests: `pnpm --filter @atlaspm/web-ui test -- --run apps/web-ui/src/feature-slices.test.ts` failed early with `vitest: not found`; focused `node` source assertion for the new slice boundaries passed
Next action: restore/install workspace dependencies, then run the focused web-ui test and follow with lint/type-check to catch extraction regressions
Failure signature: none

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The extraction is structurally sound; stabilizing mainly requires aligning ownership tests with the new slice boundaries and clearing any compile/runtime fallout from moving JSX helpers and follower controls.
- What changed: Restored workspace dependencies with `pnpm install`. Fixed the extracted board helper module by moving JSX-bearing utilities into `apps/web-ui/src/components/project-board/project-board-utils.tsx`, updated `apps/web-ui/src/feature-slices.test.ts` to read the new path, and re-added the remaining `CheckCircle2` / `Circle` imports still used by the boolean custom-field cell in `apps/web-ui/src/components/project-board.tsx`. Updated `apps/web-ui/src/followers-slice.test.ts` so it now asserts `task-detail-drawer.tsx` delegates to `task-detail-details-tab.tsx`, while follower controls and follower API wiring live in that extracted details slice.
- Current blocker: none.
- Next exact step: Wait for review on draft PR `#399` and address any follow-up comments without regrowing the top-level board/task-detail shells.
- Verification gap: none for `apps/web-ui`; lint, type-check, focused slice tests, and the full web-ui test suite all pass locally.
- Files touched: `.codex-supervisor/issues/393/issue-journal.md`, `apps/web-ui/src/feature-slices.test.ts`, `apps/web-ui/src/followers-slice.test.ts`, `apps/web-ui/src/components/task-detail-drawer.tsx`, `apps/web-ui/src/components/task-detail/task-detail-comments-tab.tsx`, `apps/web-ui/src/components/task-detail/task-detail-details-tab.tsx`, `apps/web-ui/src/components/task-detail/task-detail-utils.tsx`, `apps/web-ui/src/components/project-board.tsx`, `apps/web-ui/src/components/project-board/project-board-state.ts`, `apps/web-ui/src/components/project-board/project-board-utils.tsx`
- Rollback concern: `task-detail-details-tab.tsx` now centralizes a broad set of detail-side behaviors, so later feature work in attachments, reminders, approvals, and followers should keep adding focused child slices rather than regrowing that file.
- Commands run: `pnpm install`; `pnpm --filter @atlaspm/web-ui test -- --run src/feature-slices.test.ts`; `pnpm --filter @atlaspm/web-ui type-check`; `pnpm --filter @atlaspm/web-ui lint`; `pnpm --filter @atlaspm/web-ui test`; `git commit -m "refactor(web-ui): slice board and task detail surfaces"`; `git push -u origin codex/issue-393`; `gh pr create --draft --base main --head codex/issue-393 ...`.
### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
