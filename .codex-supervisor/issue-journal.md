# Issue #340: P2: Write ADR for task domain decomposition and controller split

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/340
- Branch: codex/reopen-issue-340
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-340
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-340/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: b442bd9fb3b604c541784982487ce51c2cafc802
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T12:06:10.815Z

## Latest Codex Summary
- Added `docs/adr-task-domain-decomposition.md` to define explicit `TasksController` feature slices, extraction order, test ownership, and rollback constraints before refactoring.
- Added `packages/domain/src/__tests__/task-domain-adr.test.ts` to assert the ADR exists and names the required module boundaries and control sections.
- Added an architecture cross-reference to the new ADR in `docs/architecture.md`.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The main risk for issue #340 is undocumented controller ownership drift during future extraction, so the narrowest proof is an ADR-content test that fails if the explicit slice boundaries or migration controls are missing.
- Primary failure or risk: Initial focused verification failed because this worktree had no installed dependencies (`tsc: not found` during `pnpm --filter @atlaspm/domain test`); after `pnpm install`, the ADR-content test passed.
- Last focused command: `pnpm --filter @atlaspm/domain test -- --test-name-pattern='task domain ADR defines explicit slices and migration controls'`
- Files changed: `docs/adr-task-domain-decomposition.md`, `docs/architecture.md`, and `packages/domain/src/__tests__/task-domain-adr.test.ts`
- Next 1-3 actions:
  1. Commit the ADR and focused test on `codex/reopen-issue-340`.
  2. Open or update the branch PR if one is required for supervisor flow.
  3. Hand off with the branch ready for review.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `packages/domain/src/__tests__/task-domain-adr.test.ts` first so the issue could fail on a missing/incomplete ADR instead of relying on manual doc review.
  - Initial failure: `tsc: not found` from `pnpm --filter @atlaspm/domain test -- --test-name-pattern='task domain ADR defines explicit slices and migration controls'` because the worktree had no installed dependencies.
  - After `pnpm install`, the same focused test passed against the new ADR.
- Failure signature:
  - `missing-worktree-deps-tsc-not-found`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/domain test -- --test-name-pattern='task domain ADR defines explicit slices and migration controls'`
  - `pnpm --filter @atlaspm/domain type-check`
- Implementation notes:
  - The ADR maps the current `TasksController` routes into six explicit slices: `task-core`, `comments-mentions`, `attachments`, `reminders`, `dependencies-subtasks`, and `timeline`.
  - The ADR defines the extraction order as `task-core` first and `timeline` last, with test ownership and rollback constraints called out per slice.
  - `docs/architecture.md` now links to the ADR so the decomposition decision is discoverable beside the existing auth ADR reference.
