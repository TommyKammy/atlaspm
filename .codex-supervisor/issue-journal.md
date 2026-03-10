# Issue #340: P2: Write ADR for task domain decomposition and controller split

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/340
- Branch: codex/reopen-issue-340
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-340
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-340/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 0363ce26b4aef3043de6b1604013312c781b06bb
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zSHS1|PRRT_kwDORWcwRc5zSHTV
- Repeated failure signature count: 1
- Updated at: 2026-03-10T12:15:04.313Z

## Latest Codex Summary
- Addressed PR #343 review feedback by improving the ADR-content test failure message and moving the task decomposition ADR link from `## Auth` to `## Boundaries` in `docs/architecture.md`.
- Re-ran the focused `@atlaspm/domain` verification after the review fixes; the test and type-check both passed.
- Pushed commit `ded5c39` and resolved review threads `PRRT_kwDORWcwRc5zSHS1` and `PRRT_kwDORWcwRc5zSHTV` on PR #343.

## Active Failure Context
- Category: review
- Summary: 2 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/343#discussion_r2911323047
- Details:
  - packages/domain/src/__tests__/task-domain-adr.test.ts:27 The `assert.match` call on line 27 has no custom failure message. When a section or keyword is missing from the ADR, the test fails with a generic error like "The input did not match the regular expression /.../" without indicating which expected string was not found. Since the same `assert.match` is called in a loop over 12 different expected strings, a failure message should be passed as the third argument to identify which string was missing (e.g., `assert.match(adr, new RegExp(escapeRegExp(expected)), \`ADR is missing required content: ${expected}\`)`). ```suggestion assert.match(adr, new RegExp(escapeRegExp(expected)), `ADR is missing required content: ${expected}`); ```
  - docs/architecture.md:15 The ADR cross-reference is placed inside the `## Auth` section (lines 8–16), but the task domain decomposition is entirely unrelated to authentication. The `## Boundaries` section at the top of the file (lines 3–6), or a dedicated `## ADRs` / `## Architecture Decisions` entry, would be a far more appropriate home for this link. As written, a reader scanning for controller architecture decisions would need to look inside the auth section to find it.

## Codex Working Notes
### Current Handoff
- Hypothesis: The main risk for issue #340 is undocumented controller ownership drift during future extraction, so the narrowest proof is an ADR-content test that fails if the explicit slice boundaries or migration controls are missing.
- Primary failure or risk: No local verification failure remains; PR #343 has the review fixes pushed and the bot threads resolved, but GitHub still reports `mergeStateStatus=UNSTABLE` and may need a refresh cycle before merge.
- Last focused command: `pnpm --filter @atlaspm/domain test -- --test-name-pattern='task domain ADR defines explicit slices and migration controls'`
- Files changed: `docs/adr-task-domain-decomposition.md`, `docs/architecture.md`, and `packages/domain/src/__tests__/task-domain-adr.test.ts`
- Next 1-3 actions:
  1. Check whether PR #343 leaves `UNSTABLE` after GitHub refreshes branch state.
  2. Merge PR #343 once the host reports a clean merge state.
  3. Only revisit if another review comment appears.

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
  - The ADR link in `docs/architecture.md` now lives under `## Boundaries`, which matches the controller-split subject matter better than `## Auth`.
  - The ADR-content test now includes a per-string assertion message so failures identify the missing required section or boundary explicitly.
  - Review threads `PRRT_kwDORWcwRc5zSHS1` and `PRRT_kwDORWcwRc5zSHTV` were resolved after pushing `ded5c39`.
